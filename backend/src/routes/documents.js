import express from 'express';
import { query, buildInsert } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

const router = express.Router();

const uploadToS3 = createS3Upload('documents', 25);

// POST /api/documents/upload
router.post('/upload', authenticate, uploadToS3.array('files', 10), async (req, res) => {
  try {
    const { transaction_id, document_type = 'other' } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const validDocTypes = ['ppa', 'nda', 'exclusivity', 'technical', 'other'];
    if (!validDocTypes.includes(document_type)) {
      return res.status(400).json({ error: 'Invalid document type' });
    }

    const documents = [];
    for (const file of files) {
      const record = {
        transaction_id: transaction_id || null,
        document_type,
        file_name: file.originalname,
        file_path: file.key,
        file_size: file.size,
        uploaded_by: req.user.id,
        metadata: {
          uploaded_at: new Date().toISOString(),
          mime_type: file.mimetype,
          checksum: file.etag || null,
          s3_version_id: file.versionId || null,
          s3_location: file.location || null,
        },
        created_at: new Date().toISOString(),
      };
      const { cols, placeholders, values } = buildInsert(record);
      const { rows } = await query(
        `INSERT INTO documents (${cols}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      documents.push(rows[0]);
    }

    res.status(201).json({ message: `Successfully uploaded ${files.length} file(s)`, documents });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload files' });
  }
});

// GET /api/documents
router.get('/', authenticate, async (req, res) => {
  try {
    const { transaction_id, document_type } = req.query;

    let sql = 'SELECT * FROM documents WHERE uploaded_by = $1';
    const params = [req.user.id];

    if (transaction_id) {
      params.push(transaction_id);
      sql += ` AND transaction_id = $${params.length}`;
    }
    if (document_type) {
      params.push(document_type);
      sql += ` AND document_type = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const { rows: documents } = await query(sql, params);
    res.json({ documents });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/documents/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM documents WHERE id = $1', [id]);
    const document = rows[0];

    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.uploaded_by !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    const downloadUrl = await generatePresignedUrl(document.file_path, 3600);
    res.json({ ...document, download_url: downloadUrl });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to retrieve document' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM documents WHERE id = $1', [id]);
    const document = rows[0];

    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.uploaded_by !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    await deleteFile(document.file_path);
    await query('DELETE FROM documents WHERE id = $1', [id]);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
