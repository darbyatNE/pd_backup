import express from 'express';
import { query, buildInsert, buildUpdateSet } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// WHERE clause limiting a project write to what the caller may edit:
//  - admin: any project; everyone else: own seller_id or own company's project.
// `startAt` = number of params already bound before this clause.
function projectOwnershipWhere(req, startAt) {
  if (req.user.role === 'admin') {
    return { whereSql: `WHERE id = $${startAt + 1}`, whereParams: [req.params.id] };
  }
  return {
    whereSql: `WHERE id = $${startAt + 1} AND (seller_id = $${startAt + 2} OR owner_company_id = $${startAt + 3})`,
    whereParams: [req.params.id, req.user.id, req.user.companyId],
  };
}

// GET /api/projects/my-projects - Get current seller's projects
router.get('/my-projects', authenticate, async (req, res) => {
  console.log('=== /my-projects endpoint hit ===');
  console.log('User ID:', req.user?.id);

  try {
    const { rows: userRows } = await query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );
    const userData = userRows[0];

    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userData.role !== 'seller') {
      return res.status(403).json({ error: 'Only sellers can access their projects' });
    }

    const { rows: projects } = await query(
      'SELECT * FROM projects WHERE seller_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json({ projects });
  } catch (error) {
    console.error('Get seller projects error:', error);
    res.status(500).json({ error: 'Failed to fetch your projects' });
  }
});

// GET /api/projects - List projects visible to the caller.
//  - admin: every project.
//  - everyone else: published marketplace projects + their own company's private projects.
router.get('/', authenticate, async (req, res) => {
  try {
    let projects;
    if (req.user.role === 'admin') {
      ({ rows: projects } = await query('SELECT * FROM projects ORDER BY created_at DESC'));
    } else {
      ({ rows: projects } = await query(
        `SELECT * FROM projects
         WHERE (visibility = 'marketplace' AND status = 'published')
            OR (owner_company_id IS NOT NULL AND owner_company_id = $1)
         ORDER BY created_at DESC`,
        [req.user.companyId]
      ));
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
    const { rows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
    const project = rows[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /api/projects - Create new seller project
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      name, generation_type, capacity_mw, location, metadata, status = 'draft',
      fixed_price_per_mwh, eac_price_per_mwh, capacity_price_per_mw_day, price_currency, annual_escalator_percent,
      expected_cod, guaranteed_cod, delivery_term_years, term_start_date, term_end_date,
      guaranteed_availability_year1_percent, guaranteed_availability_ongoing_percent,
      eac_scheme, settlement_point, connection_point, iso, zone, vppa_terms, price_schedule,
    } = req.body;

    if (!name || !generation_type || !capacity_mw) {
      return res.status(400).json({ error: 'Missing required fields: name, generation_type, capacity_mw' });
    }

    // Ownership/visibility: admins & sellers may publish to the contractable
    // marketplace; everyone else only creates projects private to their company.
    const canPublishMarketplace = req.user.role === 'admin' || req.user.role === 'seller';
    const requestedMarketplace = canPublishMarketplace && (req.body.visibility ?? 'marketplace') === 'marketplace';
    const visibility = requestedMarketplace ? 'marketplace' : 'private';
    const owner_company_id = visibility === 'private' ? req.user.companyId : null;

    const insertData = {
      seller_id: req.user.id, name, generation_type, capacity_mw, location, metadata, status,
      visibility, owner_company_id,
    };

    if (fixed_price_per_mwh != null) insertData.fixed_price_per_mwh = fixed_price_per_mwh;
    if (eac_price_per_mwh != null) insertData.eac_price_per_mwh = eac_price_per_mwh;
    if (capacity_price_per_mw_day != null) insertData.capacity_price_per_mw_day = capacity_price_per_mw_day;
    if (price_currency) insertData.price_currency = price_currency;
    if (annual_escalator_percent != null) insertData.annual_escalator_percent = annual_escalator_percent;
    if (expected_cod) insertData.expected_cod = expected_cod;
    if (guaranteed_cod) insertData.guaranteed_cod = guaranteed_cod;
    if (delivery_term_years != null) insertData.delivery_term_years = delivery_term_years;
    if (term_start_date) insertData.term_start_date = term_start_date;
    if (term_end_date) insertData.term_end_date = term_end_date;
    if (guaranteed_availability_year1_percent != null) insertData.guaranteed_availability_year1_percent = guaranteed_availability_year1_percent;
    if (guaranteed_availability_ongoing_percent != null) insertData.guaranteed_availability_ongoing_percent = guaranteed_availability_ongoing_percent;
    if (eac_scheme) insertData.eac_scheme = eac_scheme;
    if (settlement_point) insertData.settlement_point = settlement_point;
    if (connection_point) insertData.connection_point = connection_point;
    if (iso) insertData.iso = iso;
    if (zone) insertData.zone = zone;
    if (vppa_terms) insertData.vppa_terms = vppa_terms;
    if (price_schedule) insertData.price_schedule = price_schedule;

    const { cols, placeholders, values } = buildInsert(insertData);
    const { rows } = await query(
      `INSERT INTO projects (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    res.status(201).json({ project: rows[0] });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id - Update seller project
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, generation_type, capacity_mw, location, metadata, status,
      fixed_price_per_mwh, eac_price_per_mwh, capacity_price_per_mw_day, price_currency, annual_escalator_percent,
      expected_cod, guaranteed_cod, delivery_term_years, term_start_date, term_end_date,
      guaranteed_availability_year1_percent, guaranteed_availability_ongoing_percent,
      eac_scheme, settlement_point, connection_point, iso, zone, vppa_terms, price_schedule,
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (generation_type !== undefined) updateData.generation_type = generation_type;
    if (capacity_mw !== undefined) updateData.capacity_mw = capacity_mw;
    if (location !== undefined) updateData.location = location;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (status !== undefined) updateData.status = status;
    if (fixed_price_per_mwh !== undefined) updateData.fixed_price_per_mwh = fixed_price_per_mwh;
    if (eac_price_per_mwh !== undefined) updateData.eac_price_per_mwh = eac_price_per_mwh;
    if (capacity_price_per_mw_day !== undefined) updateData.capacity_price_per_mw_day = capacity_price_per_mw_day;
    if (price_currency !== undefined) updateData.price_currency = price_currency;
    if (annual_escalator_percent !== undefined) updateData.annual_escalator_percent = annual_escalator_percent;
    if (expected_cod !== undefined) updateData.expected_cod = expected_cod;
    if (guaranteed_cod !== undefined) updateData.guaranteed_cod = guaranteed_cod;
    if (delivery_term_years !== undefined) updateData.delivery_term_years = delivery_term_years;
    if (term_start_date !== undefined) updateData.term_start_date = term_start_date;
    if (term_end_date !== undefined) updateData.term_end_date = term_end_date;
    if (guaranteed_availability_year1_percent !== undefined) updateData.guaranteed_availability_year1_percent = guaranteed_availability_year1_percent;
    if (guaranteed_availability_ongoing_percent !== undefined) updateData.guaranteed_availability_ongoing_percent = guaranteed_availability_ongoing_percent;
    if (eac_scheme !== undefined) updateData.eac_scheme = eac_scheme;
    if (settlement_point !== undefined) updateData.settlement_point = settlement_point;
    if (connection_point !== undefined) updateData.connection_point = connection_point;
    if (iso !== undefined) updateData.iso = iso;
    if (zone !== undefined) updateData.zone = zone;
    if (vppa_terms !== undefined) updateData.vppa_terms = vppa_terms;
    if (price_schedule !== undefined) updateData.price_schedule = price_schedule;

    const { setClause, values } = buildUpdateSet(updateData);
    const { whereSql, whereParams } = projectOwnershipWhere(req, values.length);
    const { rows } = await query(
      `UPDATE projects SET ${setClause} ${whereSql} RETURNING *`,
      [...values, ...whereParams]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Project not found or not yours' });
    res.json({ project: rows[0] });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// PUT /api/projects/:id/publish
router.put('/:id/publish', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { whereSql, whereParams } = projectOwnershipWhere(req, 0);
    const { rows } = await query(
      `UPDATE projects SET status = 'published', updated_at = NOW() ${whereSql} RETURNING *`,
      whereParams
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found or not yours' });
    res.json({ project: rows[0] });
  } catch (error) {
    console.error('Publish project error:', error);
    res.status(500).json({ error: 'Failed to publish project' });
  }
});

// PUT /api/projects/:id/unpublish
router.put('/:id/unpublish', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { whereSql, whereParams } = projectOwnershipWhere(req, 0);
    const { rows } = await query(
      `UPDATE projects SET status = 'unpublished', updated_at = NOW() ${whereSql} RETURNING *`,
      whereParams
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found or not yours' });
    res.json({ project: rows[0] });
  } catch (error) {
    console.error('Unpublish project error:', error);
    res.status(500).json({ error: 'Failed to unpublish project' });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { whereSql, whereParams } = projectOwnershipWhere(req, 0);
    const { rowCount } = await query(`DELETE FROM projects ${whereSql}`, whereParams);
    if (rowCount === 0) return res.status(404).json({ error: 'Project not found or not yours' });
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ===== BUYER PROJECTS =====

// GET /api/projects/buyer/my-projects
router.get('/buyer/my-projects', authenticate, async (req, res) => {
  try {
    const { rows: projects } = await query(
      'SELECT * FROM buyer_projects WHERE buyer_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ projects });
  } catch (error) {
    console.error('Get buyer projects error:', error);
    res.status(500).json({ error: 'Failed to fetch buyer projects' });
  }
});

// POST /api/projects/buyer/brownfield
router.post('/buyer/brownfield', authenticate, async (req, res) => {
  try {
    const {
      name, location, metadata,
      target_capacity_mw, target_annual_quantity_mwh, preferred_term_years,
      target_cod, max_fixed_price_per_mwh, price_currency,
      preferred_settlement_type, settlement_zone, preferred_generation_types,
      required_eac_scheme, renewable_percentage_target, net_neutral_target_year,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Project name is required' });

    const insertData = { buyer_id: req.user.id, project_type: 'brownfield', name, location, metadata };

    if (target_capacity_mw != null) insertData.target_capacity_mw = target_capacity_mw;
    if (target_annual_quantity_mwh != null) insertData.target_annual_quantity_mwh = target_annual_quantity_mwh;
    if (preferred_term_years != null) insertData.preferred_term_years = preferred_term_years;
    if (target_cod) insertData.target_cod = target_cod;
    if (max_fixed_price_per_mwh != null) insertData.max_fixed_price_per_mwh = max_fixed_price_per_mwh;
    if (price_currency) insertData.price_currency = price_currency;
    if (preferred_settlement_type) insertData.preferred_settlement_type = preferred_settlement_type;
    if (settlement_zone) insertData.settlement_zone = settlement_zone;
    if (preferred_generation_types) insertData.preferred_generation_types = preferred_generation_types;
    if (required_eac_scheme) insertData.required_eac_scheme = required_eac_scheme;
    if (renewable_percentage_target != null) insertData.renewable_percentage_target = renewable_percentage_target;
    if (net_neutral_target_year != null) insertData.net_neutral_target_year = net_neutral_target_year;

    const { cols, placeholders, values } = buildInsert(insertData);
    const { rows } = await query(
      `INSERT INTO buyer_projects (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    res.status(201).json({ project: rows[0] });
  } catch (error) {
    console.error('Create brownfield project error:', error);
    res.status(500).json({ error: 'Failed to create brownfield project' });
  }
});

// POST /api/projects/buyer/greenfield
router.post('/buyer/greenfield', authenticate, async (req, res) => {
  try {
    const {
      name, location, metadata,
      target_capacity_mw, target_annual_quantity_mwh, preferred_term_years,
      target_cod, max_fixed_price_per_mwh, price_currency,
      preferred_settlement_type, settlement_zone, preferred_generation_types,
      required_eac_scheme, renewable_percentage_target, net_neutral_target_year,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Project name is required' });

    const insertData = { buyer_id: req.user.id, project_type: 'greenfield', name, location, metadata };

    if (target_capacity_mw != null) insertData.target_capacity_mw = target_capacity_mw;
    if (target_annual_quantity_mwh != null) insertData.target_annual_quantity_mwh = target_annual_quantity_mwh;
    if (preferred_term_years != null) insertData.preferred_term_years = preferred_term_years;
    if (target_cod) insertData.target_cod = target_cod;
    if (max_fixed_price_per_mwh != null) insertData.max_fixed_price_per_mwh = max_fixed_price_per_mwh;
    if (price_currency) insertData.price_currency = price_currency;
    if (preferred_settlement_type) insertData.preferred_settlement_type = preferred_settlement_type;
    if (settlement_zone) insertData.settlement_zone = settlement_zone;
    if (preferred_generation_types) insertData.preferred_generation_types = preferred_generation_types;
    if (required_eac_scheme) insertData.required_eac_scheme = required_eac_scheme;
    if (renewable_percentage_target != null) insertData.renewable_percentage_target = renewable_percentage_target;
    if (net_neutral_target_year != null) insertData.net_neutral_target_year = net_neutral_target_year;

    const { cols, placeholders, values } = buildInsert(insertData);
    const { rows } = await query(
      `INSERT INTO buyer_projects (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    res.status(201).json({ project: rows[0] });
  } catch (error) {
    console.error('Create greenfield project error:', error);
    res.status(500).json({ error: 'Failed to create greenfield project' });
  }
});

// PUT /api/projects/buyer/:id
router.put('/buyer/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, location, metadata,
      target_capacity_mw, target_annual_quantity_mwh, preferred_term_years,
      target_cod, max_fixed_price_per_mwh, price_currency,
      preferred_settlement_type, settlement_zone, preferred_generation_types,
      required_eac_scheme, renewable_percentage_target, net_neutral_target_year,
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (location !== undefined) updateData.location = location;
    if (metadata !== undefined) updateData.metadata = metadata;
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

    const { setClause, values } = buildUpdateSet(updateData);
    const { rows } = await query(
      `UPDATE buyer_projects SET ${setClause} WHERE id = $${values.length + 1} AND buyer_id = $${values.length + 2} RETURNING *`,
      [...values, id, req.user.id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Buyer project not found' });
    res.json({ project: rows[0] });
  } catch (error) {
    console.error('Update buyer project error:', error);
    res.status(500).json({ error: 'Failed to update buyer project' });
  }
});

// DELETE /api/projects/buyer/:id
router.delete('/buyer/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM buyer_projects WHERE id = $1 AND buyer_id = $2', [id, req.user.id]);
    res.json({ message: 'Buyer project deleted successfully' });
  } catch (error) {
    console.error('Delete buyer project error:', error);
    res.status(500).json({ error: 'Failed to delete buyer project' });
  }
});

export default router;
