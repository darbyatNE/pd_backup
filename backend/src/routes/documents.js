import express from 'express';
import { getSupabaseWithUser } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload } from '../services/s3.js';
import { buildFileMetadata } from '../utils/uploads.js';
import { createGetByIdHandler, createDeleteHandler } from '../utils/resourceHandlers.js';

const router = express.Router();

// Configure multer for S3 uploads (max 25MB for documents)
const uploadToS3 = createS3Upload('documents', 25);

// POST /api/documents/upload - Upload document files
router.post('/upload', authenticate, uploadToS3.array('files', 10), async (req, res) => {
  try {
    const { transaction_id, document_type = 'other' } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Validate document type
    const validDocTypes = ['ppa', 'nda', 'exclusivity', 'technical', 'other'];
    if (!validDocTypes.includes(document_type)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    // Insert document records into Supabase
    const documentRecords = files.map((file) => ({
      transaction_id: transaction_id || null,
      document_type,
      file_name: file.originalname,
      file_path: file.key, // S3 key
      file_size: file.size,
      uploaded_by: req.user.id,
      metadata: buildFileMetadata(file),
      created_at: new Date().toISOString(),
    }));

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    const { data, error } = await supabase
      .from('documents')
      .insert(documentRecords)
      .select();

    if (error) {
      console.error('Error inserting documents:', error);
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

// GET /api/documents - List documents for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const { transaction_id, document_type } = req.query;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    let query = supabase
      .from('documents')
      .select('*')
      .eq('uploaded_by', req.user.id)
      .order('created_at', { ascending: false });

    if (transaction_id) {
      query = query.eq('transaction_id', transaction_id);
    }

    if (document_type) {
      query = query.eq('document_type', document_type);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching documents:', error);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    res.json({ documents: data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/documents/:id - Get document by ID with download URL
router.get('/:id', authenticate, createGetByIdHandler({
  table: 'documents',
  ownerField: 'uploaded_by',
  notFoundError: 'Document not found',
  retrieveError: 'Failed to retrieve document',
}));

// DELETE /api/documents/:id - Delete a document
router.delete('/:id', authenticate, createDeleteHandler({
  table: 'documents',
  ownerField: 'uploaded_by',
  notFoundError: 'Document not found',
  deleteError: 'Failed to delete document',
  successMessage: 'Document deleted successfully',
}));

export default router;
