import express from 'express';
import { query, buildInsert } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

const router = express.Router();

const uploadToS3 = createS3Upload('technical-documents', 25, { useNewStructure: true });

// POST /api/technical-documents/upload
router.post('/upload', authenticate, uploadToS3.array('files', 10), async (req, res) => {
  try {
    const { project_id, seller_type, technology_type, contract_type, metadata: customMetadata } = req.body;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const validSellerTypes = ['carbon_free', 'utility'];
    if (!seller_type || !validSellerTypes.includes(seller_type)) {
      return res.status(400).json({ error: 'seller_type is required and must be either "carbon_free" or "utility"' });
    }

    const validTechnologyTypes = ['solar', 'wind', 'nuclear', 'green_hydrogen', 'battery', 'utility_contract'];
    if (seller_type === 'carbon_free' && (!technology_type || !validTechnologyTypes.includes(technology_type))) {
      return res.status(400).json({
        error: `technology_type is required for carbon-free sellers and must be one of: ${validTechnologyTypes.slice(0, 5).join(', ')}`,
      });
    }

    if (seller_type === 'utility' && !contract_type) {
      return res.status(400).json({ error: 'contract_type is required for utility sellers' });
    }

    if (project_id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(project_id)) {
        return res.status(400).json({ error: 'project_id must be a valid UUID format' });
      }
    }

    let parsedMetadata = {};
    if (customMetadata) {
      try {
        parsedMetadata = typeof customMetadata === 'string' ? JSON.parse(customMetadata) : customMetadata;
      } catch {
        return res.status(400).json({ error: 'Invalid metadata format' });
      }
    }

    const getFileType = (filename) => {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'csv') return 'csv';
      if (ext === 'tsv') return 'tsv';
      return 'pdf';
    };

    const documents = [];
    for (const file of files) {
      const record = {
        project_id: project_id || null,
        seller_type,
        technology_type: seller_type === 'carbon_free' ? technology_type : 'utility_contract',
        contract_type: seller_type === 'utility' ? contract_type : null,
        file_name: file.originalname,
        file_path: file.key,
        file_type: getFileType(file.originalname),
        file_size: file.size,
        uploaded_by: req.user.id,
        metadata: {
          uploaded_at: new Date().toISOString(),
          mime_type: file.mimetype,
          checksum: file.etag || null,
          s3_version_id: file.versionId || null,
          s3_location: file.location || null,
          ...parsedMetadata,
        },
        uploaded_at: new Date().toISOString(),
      };
      const { cols, placeholders, values } = buildInsert(record);
      const { rows } = await query(
        `INSERT INTO technical_documents (${cols}) VALUES (${placeholders}) RETURNING *`,
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

// GET /api/technical-documents
router.get('/', authenticate, async (req, res) => {
  try {
    const { project_id, file_type, seller_type, technology_type } = req.query;

    let sql = 'SELECT * FROM technical_documents WHERE uploaded_by = $1';
    const params = [req.user.id];

    if (project_id) { params.push(project_id); sql += ` AND project_id = $${params.length}`; }
    if (file_type) { params.push(file_type); sql += ` AND file_type = $${params.length}`; }
    if (seller_type) { params.push(seller_type); sql += ` AND seller_type = $${params.length}`; }
    if (technology_type) { params.push(technology_type); sql += ` AND technology_type = $${params.length}`; }

    sql += ' ORDER BY uploaded_at DESC';

    const { rows: documents } = await query(sql, params);
    res.json({ documents });
  } catch (error) {
    console.error('Error fetching technical documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/technical-documents/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM technical_documents WHERE id = $1', [id]);
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

// DELETE /api/technical-documents/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM technical_documents WHERE id = $1', [id]);
    const document = rows[0];

    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.uploaded_by !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    await deleteFile(document.file_path);
    await query('DELETE FROM technical_documents WHERE id = $1', [id]);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
