import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import multerS3 from 'multer-s3';

// Initialize S3 client
// When running in ECS, credentials are automatically obtained from the task IAM role
// For local development, use AWS CLI credentials or environment variables
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const bucketName = process.env.AWS_S3_BUCKET_NAME;

/**
 * Generate S3 key for file storage
 * @param {string} userId - User ID
 * @param {string} folder - Folder name (e.g., 'documents', 'power-plans')
 * @param {string} filename - Original filename
 * @param {string} userRole - User role (buyer/seller) - optional
 * @param {string} category - Document category - optional
 * @returns {string} S3 key
 */
export const generateS3Key = (userId, folder, filename, userRole = null, category = null) => {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

  // New structure: {userRole}/{userId}/{category}/{timestamp}-{filename}
  // Legacy structure: {folder}/{userId}/{timestamp}-{filename}
  if (userRole && category) {
    return `${userRole}/${userId}/${category}/${timestamp}-${sanitizedFilename}`;
  }

  // Fallback to legacy structure for backward compatibility
  return `${folder}/${userId}/${timestamp}-${sanitizedFilename}`;
};

/**
 * Configure multer to upload files to S3
 * @param {string} folder - Folder name for organizing files (legacy)
 * @param {number} maxSizeMB - Maximum file size in MB
 * @param {Object} options - Additional options
 * @param {boolean} options.useNewStructure - Use new role/category structure
 * @param {Array<string>} options.allowedFileTypes - Additional allowed file types
 * @returns {multer} Configured multer instance
 */
export const createS3Upload = (folder, maxSizeMB = 25, options = {}) => {
  const { useNewStructure = false, allowedFileTypes = [] } = options;

  const upload = multer({
    storage: multerS3({
      s3: s3Client,
      bucket: bucketName,
      metadata: (req, file, cb) => {
        cb(null, {
          fieldName: file.fieldname,
          uploadedBy: req.user?.id || 'unknown',
          uploadedAt: new Date().toISOString(),
          userRole: req.user?.role || 'unknown',
          ...(req.body?.metadata && { customMetadata: req.body.metadata }),
        });
      },
      key: (req, file, cb) => {
        const userId = req.user?.id || 'anonymous';
        const userRole = req.user?.role || null;
        const category = req.body?.category || req.body?.document_category || null;

        // Use new structure if enabled and role/category are provided
        const key = useNewStructure && userRole && category
          ? generateS3Key(userId, folder, file.originalname, userRole, category)
          : generateS3Key(userId, folder, file.originalname);

        cb(null, key);
      },
    }),
    limits: {
      fileSize: maxSizeMB * 1024 * 1024, // Convert MB to bytes
    },
    fileFilter: (req, file, cb) => {
      // Base allowed types
      const allowedMimes = [
        'application/pdf',
        'text/csv',
        'text/tab-separated-values',
        'text/plain', // Some systems send TSV as text/plain
        ...allowedFileTypes,
      ];

      const allowedExtensions = ['.pdf', '.csv', '.tsv', '.doc', '.docx', '.xls', '.xlsx'];
      const fileExt = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

      if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`));
      }
    },
  });

  return upload;
};

/**
 * Generate a presigned URL for downloading a file
 * @param {string} key - S3 key of the file
 * @param {number} expiresIn - URL expiry time in seconds (default: 3600)
 * @returns {Promise<string>} Presigned URL
 */
export const generatePresignedUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw new Error('Failed to generate download URL');
  }
};

/**
 * Delete a file from S3
 * @param {string} key - S3 key of the file to delete
 * @returns {Promise<void>}
 */
export const deleteFile = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    throw new Error('Failed to delete file');
  }
};

/**
 * Upload a file buffer directly to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 key for the file
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} S3 key of uploaded file
 */
export const uploadBuffer = async (buffer, key, contentType) => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  try {
    await s3Client.send(command);
    return key;
  } catch (error) {
    console.error('Error uploading buffer to S3:', error);
    throw new Error('Failed to upload file');
  }
};

export { s3Client, bucketName };
