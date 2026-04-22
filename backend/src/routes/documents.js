import express from 'express';
import { getSupabaseWithUser } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

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
      metadata: {
        uploaded_at: new Date().toISOString(),
        mime_type: file.mimetype,
        checksum: file.etag || null, // S3 ETag serves as checksum for integrity verification
        s3_version_id: file.versionId || null, // S3 version ID if versioning is enabled
        s3_location: file.location || null, // Full S3 URL
      },
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
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user has access to this document
    if (document.uploaded_by !== req.user.id) {
      // TODO: Add logic to check if user is part of the transaction
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

// DELETE /api/documents/:id - Delete a document
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    // Fetch the document to get file_path and verify ownership
    const { data: document, error: fetchError } = await supabase
      .from('documents')
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
      .from('documents')
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
