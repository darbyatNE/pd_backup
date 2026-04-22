import express from 'express';
import { getSupabaseWithUser } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { createS3Upload, generatePresignedUrl, deleteFile } from '../services/s3.js';

const router = express.Router();

// Configure multer for S3 uploads (max 15MB for power plans, use new structure)
const uploadToS3 = createS3Upload('power-plans', 15, { useNewStructure: true });

// POST /api/power-plans/upload - Upload buyer documents (brownfield/greenfield)
router.post('/upload', authenticate, uploadToS3.array('files', 10), async (req, res) => {
  try {
    const {
      plan_type = 'historical',
      facility_type,
      document_category,
      metadata: customMetadata,
    } = req.body;
    const files = req.files;

    // Validate facility_type
    const validFacilityTypes = ['brownfield', 'greenfield'];
    if (!facility_type || !validFacilityTypes.includes(facility_type)) {
      return res.status(400).json({
        error: 'facility_type is required and must be either "brownfield" or "greenfield"',
      });
    }

    // Validate document_category
    const validDocumentCategories = [
      'historical_invoice',
      'utility_contract',
      'meter_reading',
      'grid_data',
      'equipment_config',
      'equipment_spec',
    ];
    if (!document_category || !validDocumentCategories.includes(document_category)) {
      return res.status(400).json({
        error: `document_category is required and must be one of: ${validDocumentCategories.join(', ')}`,
      });
    }

    // Validate plan type
    const validPlanTypes = ['historical', 'forecast', 'custom'];
    if (!validPlanTypes.includes(plan_type)) {
      return res.status(400).json({ error: 'Invalid plan type' });
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

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Insert power plan records into Supabase
    const planRecords = files.map((file) => ({
      buyer_id: req.user.id,
      plan_type,
      facility_type,
      document_category,
      file_name: file.originalname,
      file_path: file.key, // S3 key
      file_size: file.size,
      metadata: {
        uploaded_at: new Date().toISOString(),
        mime_type: file.mimetype,
        checksum: file.etag || null, // S3 ETag serves as checksum for integrity verification
        s3_version_id: file.versionId || null, // S3 version ID if versioning is enabled
        s3_location: file.location || null, // Full S3 URL
        ...parsedMetadata, // Merge custom metadata (utility_provider, date_range, etc.)
      },
      created_at: new Date().toISOString(),
    }));

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    const { data, error } = await supabase
      .from('power_plans')
      .insert(planRecords)
      .select();

    if (error) {
      console.error('Error inserting power plans:', error);
      return res.status(500).json({ error: 'Failed to save power plan records' });
    }

    res.status(201).json({
      message: `Successfully uploaded ${files.length} file(s)`,
      plans: data,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload files' });
  }
});

// POST /api/power-plans/greenfield-form - Submit greenfield equipment form (no file upload)
router.post('/greenfield-form', authenticate, async (req, res) => {
  try {
    const {
      equipment_types,
      total_power_rating_kw,
      floor_area_sqft,
      cooling_system,
      power_density_w_sqft,
      additional_metadata,
    } = req.body;

    // Validate required fields
    if (!equipment_types || !total_power_rating_kw || !floor_area_sqft || !cooling_system) {
      return res.status(400).json({
        error: 'Required fields: equipment_types, total_power_rating_kw, floor_area_sqft, cooling_system',
      });
    }

    // Create greenfield form record (no file)
    const formRecord = {
      buyer_id: req.user.id,
      plan_type: 'forecast',
      facility_type: 'greenfield',
      document_category: 'equipment_spec',
      file_name: null, // No file for form submissions
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

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    const { data, error } = await supabase
      .from('power_plans')
      .insert([formRecord])
      .select();

    if (error) {
      console.error('Error inserting greenfield form:', error);
      return res.status(500).json({ error: 'Failed to save greenfield form' });
    }

    res.status(201).json({
      message: 'Greenfield equipment form submitted successfully',
      plan: data[0],
    });
  } catch (error) {
    console.error('Greenfield form error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit greenfield form' });
  }
});

// GET /api/power-plans - List power plans for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const { plan_type, facility_type, document_category } = req.query;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    let query = supabase
      .from('power_plans')
      .select('*')
      .eq('buyer_id', req.user.id)
      .order('created_at', { ascending: false });

    // Apply filters if provided
    if (plan_type) {
      query = query.eq('plan_type', plan_type);
    }

    if (facility_type) {
      query = query.eq('facility_type', facility_type);
    }

    if (document_category) {
      query = query.eq('document_category', document_category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching power plans:', error);
      return res.status(500).json({ error: 'Failed to fetch power plans' });
    }

    res.json({ plans: data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch power plans' });
  }
});

// GET /api/power-plans/:id - Get power plan by ID with download URL
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    const { data: plan, error } = await supabase
      .from('power_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !plan) {
      return res.status(404).json({ error: 'Power plan not found' });
    }

    // Check if user has access to this plan
    if (plan.buyer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate presigned URL for download if file exists
    let downloadUrl = null;
    if (plan.file_path) {
      downloadUrl = await generatePresignedUrl(plan.file_path, 3600);
    }

    res.json({
      ...plan,
      download_url: downloadUrl,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to retrieve power plan' });
  }
});

// DELETE /api/power-plans/:id - Delete a power plan
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Use user-scoped Supabase client to respect RLS
    const supabase = getSupabaseWithUser(req.userToken);

    // Fetch the plan to get file_path and verify ownership
    const { data: plan, error: fetchError } = await supabase
      .from('power_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !plan) {
      return res.status(404).json({ error: 'Power plan not found' });
    }

    // Check ownership
    if (plan.buyer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete from S3 if file exists
    if (plan.file_path) {
      await deleteFile(plan.file_path);
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('power_plans')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting power plan from DB:', deleteError);
      return res.status(500).json({ error: 'Failed to delete power plan' });
    }

    res.json({ message: 'Power plan deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to delete power plan' });
  }
});

export default router;
