import express from 'express';
import { supabase, getSupabaseWithUser } from '../services/supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/projects/my-projects - Get current seller's projects
// NOTE: This MUST come before '/:id' route to avoid conflicts
router.get('/my-projects', authenticate, async (req, res) => {
  console.log('=== /my-projects endpoint hit ===');
  console.log('User ID:', req.user?.id);
  console.log('User email:', req.user?.email);

  try {
    // Use user-scoped client to respect RLS (for both user data and projects)
    const userSupabase = getSupabaseWithUser(req.userToken);

    // Get user role from database using user-scoped client
    const { data: userData, error: userError } = await userSupabase
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single();

    console.log('User data from DB:', userData);
    console.log('User error:', userError);

    if (userError || !userData) {
      console.log('❌ User not found in database');
      return res.status(404).json({ error: 'User not found' });
    }

    // Only sellers should access this endpoint
    if (userData.role !== 'seller') {
      console.log('❌ User is not a seller, role:', userData.role);
      return res.status(403).json({ error: 'Only sellers can access their projects' });
    }

    console.log('✅ User is a seller, fetching projects...');

    const { data: projects, error } = await userSupabase
      .from('projects')
      .select('*')
      .eq('seller_id', req.user.id)
      .order('created_at', { ascending: false });

    console.log('Projects fetched:', projects?.length || 0);
    console.log('Fetch error:', error);

    if (error) {
      console.error('❌ Error fetching seller projects:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Returning projects:', JSON.stringify(projects, null, 2));
    res.json({ projects });
  } catch (error) {
    console.error('❌ Get seller projects error:', error);
    res.status(500).json({ error: 'Failed to fetch your projects' });
  }
});

// GET /api/projects - List published projects (marketplace)
router.get('/', authenticate, async (req, res) => {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ projects });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id - Get project details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /api/projects - Create new seller project (with VPPA fields)
router.post('/', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const {
      // Basic fields
      name,
      generation_type,
      capacity_mw,
      location,
      metadata,
      status = 'draft',
      // VPPA Pricing fields
      fixed_price_per_mwh,
      eac_price_per_mwh,
      price_currency,
      annual_escalator_percent,
      // VPPA Timeline fields
      expected_cod,
      guaranteed_cod,
      delivery_term_years,
      // VPPA Availability fields
      guaranteed_availability_year1_percent,
      guaranteed_availability_ongoing_percent,
      // VPPA Environmental fields
      eac_scheme,
      // VPPA Settlement fields
      settlement_point,
      connection_point,
      // JSONB fields
      vppa_terms,
      price_schedule
    } = req.body;

    if (!name || !generation_type || !capacity_mw) {
      return res.status(400).json({ error: 'Missing required fields: name, generation_type, capacity_mw' });
    }

    // Build the insert object with all provided fields
    const insertData = {
      seller_id: req.user.id,
      name,
      generation_type,
      capacity_mw,
      location,
      metadata,
      status
    };

    // Add VPPA pricing fields if provided
    if (fixed_price_per_mwh !== undefined && fixed_price_per_mwh !== null) {
      insertData.fixed_price_per_mwh = fixed_price_per_mwh;
    }
    if (eac_price_per_mwh !== undefined && eac_price_per_mwh !== null) {
      insertData.eac_price_per_mwh = eac_price_per_mwh;
    }
    if (price_currency) {
      insertData.price_currency = price_currency;
    }
    if (annual_escalator_percent !== undefined && annual_escalator_percent !== null) {
      insertData.annual_escalator_percent = annual_escalator_percent;
    }

    // Add VPPA timeline fields if provided
    if (expected_cod) {
      insertData.expected_cod = expected_cod;
    }
    if (guaranteed_cod) {
      insertData.guaranteed_cod = guaranteed_cod;
    }
    if (delivery_term_years !== undefined && delivery_term_years !== null) {
      insertData.delivery_term_years = delivery_term_years;
    }

    // Add VPPA availability fields if provided
    if (guaranteed_availability_year1_percent !== undefined && guaranteed_availability_year1_percent !== null) {
      insertData.guaranteed_availability_year1_percent = guaranteed_availability_year1_percent;
    }
    if (guaranteed_availability_ongoing_percent !== undefined && guaranteed_availability_ongoing_percent !== null) {
      insertData.guaranteed_availability_ongoing_percent = guaranteed_availability_ongoing_percent;
    }

    // Add VPPA environmental fields if provided
    if (eac_scheme) {
      insertData.eac_scheme = eac_scheme;
    }

    // Add VPPA settlement fields if provided
    if (settlement_point) {
      insertData.settlement_point = settlement_point;
    }
    if (connection_point) {
      insertData.connection_point = connection_point;
    }

    // Add JSONB fields if provided
    if (vppa_terms) {
      insertData.vppa_terms = vppa_terms;
    }
    if (price_schedule) {
      insertData.price_schedule = price_schedule;
    }

    const { data: project, error } = await userSupabase
      .from('projects')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id - Update seller project (with VPPA fields)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const { id } = req.params;
    const {
      // Basic fields
      name,
      generation_type,
      capacity_mw,
      location,
      metadata,
      status,
      // VPPA Pricing fields
      fixed_price_per_mwh,
      eac_price_per_mwh,
      price_currency,
      annual_escalator_percent,
      // VPPA Timeline fields
      expected_cod,
      guaranteed_cod,
      delivery_term_years,
      // VPPA Availability fields
      guaranteed_availability_year1_percent,
      guaranteed_availability_ongoing_percent,
      // VPPA Environmental fields
      eac_scheme,
      // VPPA Settlement fields
      settlement_point,
      connection_point,
      // JSONB fields
      vppa_terms,
      price_schedule
    } = req.body;

    // Build update object with only provided fields
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Basic fields
    if (name !== undefined) updateData.name = name;
    if (generation_type !== undefined) updateData.generation_type = generation_type;
    if (capacity_mw !== undefined) updateData.capacity_mw = capacity_mw;
    if (location !== undefined) updateData.location = location;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (status !== undefined) updateData.status = status;

    // VPPA Pricing fields
    if (fixed_price_per_mwh !== undefined) updateData.fixed_price_per_mwh = fixed_price_per_mwh;
    if (eac_price_per_mwh !== undefined) updateData.eac_price_per_mwh = eac_price_per_mwh;
    if (price_currency !== undefined) updateData.price_currency = price_currency;
    if (annual_escalator_percent !== undefined) updateData.annual_escalator_percent = annual_escalator_percent;

    // VPPA Timeline fields
    if (expected_cod !== undefined) updateData.expected_cod = expected_cod;
    if (guaranteed_cod !== undefined) updateData.guaranteed_cod = guaranteed_cod;
    if (delivery_term_years !== undefined) updateData.delivery_term_years = delivery_term_years;

    // VPPA Availability fields
    if (guaranteed_availability_year1_percent !== undefined) updateData.guaranteed_availability_year1_percent = guaranteed_availability_year1_percent;
    if (guaranteed_availability_ongoing_percent !== undefined) updateData.guaranteed_availability_ongoing_percent = guaranteed_availability_ongoing_percent;

    // VPPA Environmental fields
    if (eac_scheme !== undefined) updateData.eac_scheme = eac_scheme;

    // VPPA Settlement fields
    if (settlement_point !== undefined) updateData.settlement_point = settlement_point;
    if (connection_point !== undefined) updateData.connection_point = connection_point;

    // JSONB fields
    if (vppa_terms !== undefined) updateData.vppa_terms = vppa_terms;
    if (price_schedule !== undefined) updateData.price_schedule = price_schedule;

    const { data: project, error } = await userSupabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .eq('seller_id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('Database update error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ project });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// PUT /api/projects/:id/publish - Publish seller project
router.put('/:id/publish', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const { id } = req.params;

    const { data: project, error } = await userSupabase
      .from('projects')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('seller_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ project });
  } catch (error) {
    console.error('Publish project error:', error);
    res.status(500).json({ error: 'Failed to publish project' });
  }
});

// PUT /api/projects/:id/unpublish - Unpublish seller project
router.put('/:id/unpublish', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const { id } = req.params;

    const { data: project, error } = await userSupabase
      .from('projects')
      .update({ status: 'unpublished', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('seller_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ project });
  } catch (error) {
    console.error('Unpublish project error:', error);
    res.status(500).json({ error: 'Failed to unpublish project' });
  }
});

// DELETE /api/projects/:id - Delete seller project
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const { id } = req.params;

    const { error } = await userSupabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('seller_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ===== BUYER PROJECTS =====

// GET /api/projects/buyer/my-projects - Get buyer's projects
router.get('/buyer/my-projects', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);

    const { data: projects, error } = await userSupabase
      .from('buyer_projects')
      .select('*')
      .eq('buyer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ projects });
  } catch (error) {
    console.error('Get buyer projects error:', error);
    res.status(500).json({ error: 'Failed to fetch buyer projects' });
  }
});

// POST /api/projects/buyer/brownfield - Create brownfield project (with RFP fields)
router.post('/buyer/brownfield', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const {
      name,
      location,
      metadata,
      // RFP Requirements
      target_capacity_mw,
      target_annual_quantity_mwh,
      preferred_term_years,
      // RFP Timeline
      target_cod,
      // RFP Pricing
      max_fixed_price_per_mwh,
      price_currency,
      // RFP Settlement
      preferred_settlement_type,
      settlement_zone,
      // RFP Technology
      preferred_generation_types,
      // RFP Environmental
      required_eac_scheme,
      renewable_percentage_target,
      net_neutral_target_year
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    // Build insert object with RFP fields
    const insertData = {
      buyer_id: req.user.id,
      project_type: 'brownfield',
      name,
      location,
      metadata
    };

    // Add RFP fields if provided
    if (target_capacity_mw !== undefined && target_capacity_mw !== null) {
      insertData.target_capacity_mw = target_capacity_mw;
    }
    if (target_annual_quantity_mwh !== undefined && target_annual_quantity_mwh !== null) {
      insertData.target_annual_quantity_mwh = target_annual_quantity_mwh;
    }
    if (preferred_term_years !== undefined && preferred_term_years !== null) {
      insertData.preferred_term_years = preferred_term_years;
    }
    if (target_cod) {
      insertData.target_cod = target_cod;
    }
    if (max_fixed_price_per_mwh !== undefined && max_fixed_price_per_mwh !== null) {
      insertData.max_fixed_price_per_mwh = max_fixed_price_per_mwh;
    }
    if (price_currency) {
      insertData.price_currency = price_currency;
    }
    if (preferred_settlement_type) {
      insertData.preferred_settlement_type = preferred_settlement_type;
    }
    if (settlement_zone) {
      insertData.settlement_zone = settlement_zone;
    }
    if (preferred_generation_types) {
      insertData.preferred_generation_types = preferred_generation_types;
    }
    if (required_eac_scheme) {
      insertData.required_eac_scheme = required_eac_scheme;
    }
    if (renewable_percentage_target !== undefined && renewable_percentage_target !== null) {
      insertData.renewable_percentage_target = renewable_percentage_target;
    }
    if (net_neutral_target_year !== undefined && net_neutral_target_year !== null) {
      insertData.net_neutral_target_year = net_neutral_target_year;
    }

    const { data: project, error } = await userSupabase
      .from('buyer_projects')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ project });
  } catch (error) {
    console.error('Create brownfield project error:', error);
    res.status(500).json({ error: 'Failed to create brownfield project' });
  }
});

// POST /api/projects/buyer/greenfield - Create greenfield project (with RFP fields)
router.post('/buyer/greenfield', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const {
      name,
      location,
      metadata,
      // RFP Requirements
      target_capacity_mw,
      target_annual_quantity_mwh,
      preferred_term_years,
      // RFP Timeline
      target_cod,
      // RFP Pricing
      max_fixed_price_per_mwh,
      price_currency,
      // RFP Settlement
      preferred_settlement_type,
      settlement_zone,
      // RFP Technology
      preferred_generation_types,
      // RFP Environmental
      required_eac_scheme,
      renewable_percentage_target,
      net_neutral_target_year
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    // Build insert object with RFP fields
    const insertData = {
      buyer_id: req.user.id,
      project_type: 'greenfield',
      name,
      location,
      metadata
    };

    // Add RFP fields if provided
    if (target_capacity_mw !== undefined && target_capacity_mw !== null) {
      insertData.target_capacity_mw = target_capacity_mw;
    }
    if (target_annual_quantity_mwh !== undefined && target_annual_quantity_mwh !== null) {
      insertData.target_annual_quantity_mwh = target_annual_quantity_mwh;
    }
    if (preferred_term_years !== undefined && preferred_term_years !== null) {
      insertData.preferred_term_years = preferred_term_years;
    }
    if (target_cod) {
      insertData.target_cod = target_cod;
    }
    if (max_fixed_price_per_mwh !== undefined && max_fixed_price_per_mwh !== null) {
      insertData.max_fixed_price_per_mwh = max_fixed_price_per_mwh;
    }
    if (price_currency) {
      insertData.price_currency = price_currency;
    }
    if (preferred_settlement_type) {
      insertData.preferred_settlement_type = preferred_settlement_type;
    }
    if (settlement_zone) {
      insertData.settlement_zone = settlement_zone;
    }
    if (preferred_generation_types) {
      insertData.preferred_generation_types = preferred_generation_types;
    }
    if (required_eac_scheme) {
      insertData.required_eac_scheme = required_eac_scheme;
    }
    if (renewable_percentage_target !== undefined && renewable_percentage_target !== null) {
      insertData.renewable_percentage_target = renewable_percentage_target;
    }
    if (net_neutral_target_year !== undefined && net_neutral_target_year !== null) {
      insertData.net_neutral_target_year = net_neutral_target_year;
    }

    const { data: project, error } = await userSupabase
      .from('buyer_projects')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ project });
  } catch (error) {
    console.error('Create greenfield project error:', error);
    res.status(500).json({ error: 'Failed to create greenfield project' });
  }
});

// PUT /api/projects/buyer/:id - Update buyer project
router.put('/buyer/:id', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const { id } = req.params;
    const {
      name,
      location,
      metadata,
      // RFP Requirements
      target_capacity_mw,
      target_annual_quantity_mwh,
      preferred_term_years,
      // RFP Timeline
      target_cod,
      // RFP Pricing
      max_fixed_price_per_mwh,
      price_currency,
      // RFP Settlement
      preferred_settlement_type,
      settlement_zone,
      // RFP Technology
      preferred_generation_types,
      // RFP Environmental
      required_eac_scheme,
      renewable_percentage_target,
      net_neutral_target_year
    } = req.body;

    // Build update object
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (location !== undefined) updateData.location = location;
    if (metadata !== undefined) updateData.metadata = metadata;

    // RFP Fields
    if (target_capacity_mw !== undefined) updateData.target_capacity_mw = target_capacity_mw;
    if (target_annual_quantity_mwh !== undefined) updateData.target_annual_quantity_mwh = target_annual_quantity_mwh;
    if (preferred_term_years !== undefined) updateData.preferred_term_years = preferred_term_years;
    if (target_cod !== undefined) updateData.target_cod = target_cod;
    if (max_fixed_price_per_mwh !== undefined) updateData.max_fixed_price_per_mwh = max_fixed_price_per_mwh;
    if (price_currency !== undefined) updateData.price_currency = price_currency;
    if (preferred_settlement_type !== undefined) updateData.preferred_settlement_type = preferred_settlement_type;
    if (settlement_zone !== undefined) updateData.settlement_zone = settlement_zone;
    if (preferred_generation_types !== undefined) updateData.preferred_generation_types = preferred_generation_types;
    if (required_eac_scheme !== undefined) updateData.required_eac_scheme = required_eac_scheme;
    if (renewable_percentage_target !== undefined) updateData.renewable_percentage_target = renewable_percentage_target;
    if (net_neutral_target_year !== undefined) updateData.net_neutral_target_year = net_neutral_target_year;

    const { data: project, error } = await userSupabase
      .from('buyer_projects')
      .update(updateData)
      .eq('id', id)
      .eq('buyer_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ project });
  } catch (error) {
    console.error('Update buyer project error:', error);
    res.status(500).json({ error: 'Failed to update buyer project' });
  }
});

// DELETE /api/projects/buyer/:id - Delete buyer project
router.delete('/buyer/:id', authenticate, async (req, res) => {
  try {
    const userSupabase = getSupabaseWithUser(req.userToken);
    const { id } = req.params;

    const { error } = await userSupabase
      .from('buyer_projects')
      .delete()
      .eq('id', id)
      .eq('buyer_id', req.user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: 'Buyer project deleted successfully' });
  } catch (error) {
    console.error('Delete buyer project error:', error);
    res.status(500).json({ error: 'Failed to delete buyer project' });
  }
});

export default router;
