import express from 'express';
import { getSupabaseWithUser } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload } from '../services/s3.js';
import { buildFileMetadata, parseCustomMetadata } from '../utils/uploads.js';
import { createGetByIdHandler, createDeleteHandler } from '../utils/resourceHandlers.js';

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
    const { metadata: parsedMetadata, error: metadataError } = parseCustomMetadata(customMetadata);
    if (metadataError) {
      return res.status(400).json({ error: metadataError });
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
      metadata: buildFileMetadata(file, parsedMetadata),
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
router.get('/:id', authenticate, createGetByIdHandler({
  table: 'technical_documents',
  ownerField: 'uploaded_by',
  notFoundError: 'Document not found',
  retrieveError: 'Failed to retrieve document',
}));

// DELETE /api/technical-documents/:id - Delete a technical document
router.delete('/:id', authenticate, createDeleteHandler({
  table: 'technical_documents',
  ownerField: 'uploaded_by',
  notFoundError: 'Document not found',
  deleteError: 'Failed to delete document',
  successMessage: 'Document deleted successfully',
}));

export default router;
