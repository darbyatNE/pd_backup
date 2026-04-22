import express from 'express';
import { getSupabaseWithUser } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

const router = express.Router();

// Configure multer for S3 uploads (max 25MB for technical documents, use new structure)
const uploadToS3 = createS3Upload('technical-documents', 25, { useNewStructure: true });

// POST /api/technical-documents/upload - Upload seller technical documents
router.post('/upload', authenticate, uploadToS3.array('files', 10), async (req, res) => {
  try {
    const {
      project_id,
      seller_type,
      technology_type,
      contract_type,
      metadata: customMetadata,
    } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Validate seller_type
    const validSellerTypes = ['carbon_free', 'utility'];
    if (!seller_type || !validSellerTypes.includes(seller_type)) {
      return res.status(400).json({
        error: 'seller_type is required and must be either "carbon_free" or "utility"',
      });
    }

    // Validate technology_type for carbon-free sellers
    const validTechnologyTypes = ['solar', 'wind', 'nuclear', 'green_hydrogen', 'battery', 'utility_contract'];
    if (seller_type === 'carbon_free') {
      if (!technology_type || !validTechnologyTypes.includes(technology_type)) {
        return res.status(400).json({
          error: `technology_type is required for carbon-free sellers and must be one of: ${validTechnologyTypes.slice(0, 5).join(', ')}`,
        });
      }
    }

    // For utility sellers, validate contract_type is provided
    if (seller_type === 'utility' && !contract_type) {
      return res.status(400).json({
        error: 'contract_type is required for utility sellers',
      });
    }

    // Validate project_id format if provided
    if (project_id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(project_id)) {
        return res.status(400).json({
          error: 'project_id must be a valid UUID format',
        });
      }
    }

    // Parse custom metadata if provided
    let parsedMetadata = {};
    if (customMetadata) {
      try {
        parsedMetadata = typeof customMetadata === 'string' ? JSON.parse(customMetadata) : customMetadata;
      } catch (e) {
        return res.status(400).json({ error: 'Invalid metadata format' });
      }
    }

    // Determine file type from extension
    const getFileType = (filename) => {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'csv') return 'csv';
      if (ext === 'tsv') return 'tsv';
      return 'pdf'; // default
    };

    // Insert technical document records into Supabase
    const documentRecords = files.map((file) => ({
      project_id: project_id || null,
      seller_type,
      technology_type: seller_type === 'carbon_free' ? technology_type : 'utility_contract',
      contract_type: seller_type === 'utility' ? contract_type : null,
      file_name: file.originalname,
      file_path: file.key, // S3 key
      file_type: getFileType(file.originalname),
      file_size: file.size,
      uploaded_by: req.user.id,
      metadata: {
        uploaded_at: new Date().toISOString(),
        mime_type: file.mimetype,
        checksum: file.etag || null, // S3 ETag serves as checksum for integrity verification
        s3_version_id: file.versionId || null, // S3 version ID if versioning is enabled
        s3_location: file.location || null, // Full S3 URL
        ...parsedMetadata, // Merge custom metadata
      },
      uploaded_at: new Date().toISOString(),
    }));

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    const { data, error } = await supabase
      .from('technical_documents')
      .insert(documentRecords)
      .select();

    if (error) {
      console.error('Error inserting technical documents:', error);
      return res.status(500).json({ error: 'Failed to save document records' });
    }

    res.status(201).json({
      message: `Successfully uploaded ${files.length} file(s)`,
      documents: data,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload files' });
  }
});

// GET /api/technical-documents - List technical documents for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const { project_id, file_type, seller_type, technology_type } = req.query;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    let query = supabase
      .from('technical_documents')
      .select('*')
      .eq('uploaded_by', req.user.id)
      .order('uploaded_at', { ascending: false });

    // Apply filters if provided
    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    if (file_type) {
      query = query.eq('file_type', file_type);
    }

    if (seller_type) {
      query = query.eq('seller_type', seller_type);
    }

    if (technology_type) {
      query = query.eq('technology_type', technology_type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching technical documents:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    res.json({ documents: data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/technical-documents/:id - Get technical document by ID with download URL
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    const { data: document, error } = await supabase
      .from('technical_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user has access to this document
    if (document.uploaded_by !== req.user.id) {
      // TODO: Add logic to check if user is part of the project
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate presigned URL for download
    const downloadUrl = await generatePresignedUrl(document.file_path, 3600);

    res.json({
      ...document,
      download_url: downloadUrl,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to retrieve document' });
  }
});

// DELETE /api/technical-documents/:id - Delete a technical document
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    // Fetch the document to get file_path and verify ownership
    const { data: document, error: fetchError } = await supabase
      .from('technical_documents')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check ownership
    if (document.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete from S3
    await deleteFile(document.file_path);

    // Delete from database
    const { error: deleteError } = await supabase
      .from('technical_documents')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting document from DB:', deleteError);
      return res.status(500).json({ error: 'Failed to delete document' });
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
