import express from 'express';
import { query, buildInsert } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

const router = express.Router();

const uploadToS3 = createS3Upload('power-plans', 15, { useNewStructure: true });

// POST /api/power-plans/upload
router.post('/upload', authenticate, uploadToS3.array('files', 10), async (req, res) => {
  try {
    const { plan_type = 'historical', facility_type, document_category, metadata: customMetadata } = req.body;
    const files = req.files;

    const validFacilityTypes = ['brownfield', 'greenfield'];
    if (!facility_type || !validFacilityTypes.includes(facility_type)) {
      return res.status(400).json({ error: 'facility_type is required and must be either "brownfield" or "greenfield"' });
    }

    const validDocumentCategories = ['historical_invoice', 'utility_contract', 'meter_reading', 'grid_data', 'equipment_config', 'equipment_spec'];
    if (!document_category || !validDocumentCategories.includes(document_category)) {
      return res.status(400).json({ error: `document_category is required and must be one of: ${validDocumentCategories.join(', ')}` });
    }

    const validPlanTypes = ['historical', 'forecast', 'custom'];
    if (!validPlanTypes.includes(plan_type)) return res.status(400).json({ error: 'Invalid plan type' });

    let parsedMetadata = {};
    if (customMetadata) {
      try {
        parsedMetadata = typeof customMetadata === 'string' ? JSON.parse(customMetadata) : customMetadata;
      } catch {
        return res.status(400).json({ error: 'Invalid metadata format' });
      }
    }

    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const plans = [];
    for (const file of files) {
      const record = {
        buyer_id: req.user.id,
        plan_type,
        facility_type,
        document_category,
        file_name: file.originalname,
        file_path: file.key,
        file_size: file.size,
        metadata: {
          uploaded_at: new Date().toISOString(),
          mime_type: file.mimetype,
          checksum: file.etag || null,
          s3_version_id: file.versionId || null,
          s3_location: file.location || null,
          ...parsedMetadata,
        },
        created_at: new Date().toISOString(),
      };
      const { cols, placeholders, values } = buildInsert(record);
      const { rows } = await query(
        `INSERT INTO power_plans (${cols}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      plans.push(rows[0]);
    }

    res.status(201).json({ message: `Successfully uploaded ${files.length} file(s)`, plans });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload files' });
  }
});

// POST /api/power-plans/greenfield-form
router.post('/greenfield-form', authenticate, async (req, res) => {
  try {
    const { equipment_types, total_power_rating_kw, floor_area_sqft, cooling_system, power_density_w_sqft, additional_metadata } = req.body;

    if (!equipment_types || !total_power_rating_kw || !floor_area_sqft || !cooling_system) {
      return res.status(400).json({ error: 'Required fields: equipment_types, total_power_rating_kw, floor_area_sqft, cooling_system' });
    }

    const record = {
      buyer_id: req.user.id,
      plan_type: 'forecast',
      facility_type: 'greenfield',
      document_category: 'equipment_spec',
      file_name: null,
      file_path: null,
      file_size: null,
      metadata: {
        submitted_at: new Date().toISOString(),
        equipment_types: Array.isArray(equipment_types) ? equipment_types : [equipment_types],
        total_power_rating_kw: parseFloat(total_power_rating_kw),
        floor_area_sqft: parseFloat(floor_area_sqft),
        cooling_system,
        power_density_w_sqft: power_density_w_sqft ? parseFloat(power_density_w_sqft) : null,
        ...additional_metadata,
      },
      created_at: new Date().toISOString(),
    };

    const { cols, placeholders, values } = buildInsert(record);
    const { rows } = await query(
      `INSERT INTO power_plans (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    res.status(201).json({ message: 'Greenfield equipment form submitted successfully', plan: rows[0] });
  } catch (error) {
    console.error('Greenfield form error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit greenfield form' });
  }
});

// GET /api/power-plans
router.get('/', authenticate, async (req, res) => {
  try {
    const { plan_type, facility_type, document_category } = req.query;

    let sql = 'SELECT * FROM power_plans WHERE buyer_id = $1';
    const params = [req.user.id];

    if (plan_type) { params.push(plan_type); sql += ` AND plan_type = $${params.length}`; }
    if (facility_type) { params.push(facility_type); sql += ` AND facility_type = $${params.length}`; }
    if (document_category) { params.push(document_category); sql += ` AND document_category = $${params.length}`; }

    sql += ' ORDER BY created_at DESC';

    const { rows: plans } = await query(sql, params);
    res.json({ plans });
  } catch (error) {
    console.error('Error fetching power plans:', error);
    res.status(500).json({ error: 'Failed to fetch power plans' });
  }
});

// GET /api/power-plans/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM power_plans WHERE id = $1', [id]);
    const plan = rows[0];

    if (!plan) return res.status(404).json({ error: 'Power plan not found' });
    if (plan.buyer_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    let downloadUrl = null;
    if (plan.file_path) downloadUrl = await generatePresignedUrl(plan.file_path, 3600);

    res.json({ ...plan, download_url: downloadUrl });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to retrieve power plan' });
  }
});

// DELETE /api/power-plans/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT * FROM power_plans WHERE id = $1', [id]);
    const plan = rows[0];

    if (!plan) return res.status(404).json({ error: 'Power plan not found' });
    if (plan.buyer_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });

    if (plan.file_path) await deleteFile(plan.file_path);
    await query('DELETE FROM power_plans WHERE id = $1', [id]);

    res.json({ message: 'Power plan deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to delete power plan' });
  }
});

export default router;
