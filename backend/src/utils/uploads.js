/**
 * Build the standard metadata object stored alongside an uploaded file.
 * Captures S3 integrity/versioning details shared by every upload route.
 * @param {Object} file - Multer/multer-s3 file object
 * @param {Object} extra - Additional metadata to merge in (e.g. parsed custom metadata)
 * @returns {Object} Metadata object
 */
export const buildFileMetadata = (file, extra = {}) => ({
  uploaded_at: new Date().toISOString(),
  mime_type: file.mimetype,
  checksum: file.etag || null, // S3 ETag serves as checksum for integrity verification
  s3_version_id: file.versionId || null, // S3 version ID if versioning is enabled
  s3_location: file.location || null, // Full S3 URL
  ...extra,
});

/**
 * Parse optional client-supplied metadata that may arrive as a JSON string or object.
 * @param {string|Object|undefined} raw - Raw metadata from the request body
 * @returns {{ metadata?: Object, error?: string }} Parsed metadata, or an error message on failure
 */
export const parseCustomMetadata = (raw) => {
  if (!raw) {
    return { metadata: {} };
  }

  try {
    const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { metadata };
  } catch {
    return { error: 'Invalid metadata format' };
  }
};
