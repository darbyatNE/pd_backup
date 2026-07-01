import express from 'express';
import { query, buildInsert, buildUpdateSet } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';
import { upsertProjectProducts } from './projectProducts.js';

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

const numOrNull = (v) => (v == null || v === '' ? null : Number(v));

// Default hourly delivery shape for a generation type — mirrors the frontend
// helper in frontend/src/data/linkedContracts.ts (Peaker→evening peak, etc.).
function defaultShapeForGenType(g) {
  const s = (g || '').toLowerCase();
  if (s.includes('solar')) return 'solar';
  if (s.includes('wind')) return 'wind';
  if (s.includes('peaker') || s.includes('hybrid') || s.includes('battery') || s.includes('storage')) return 'evening';
  return 'flat';
}

// Derive {start, end} year/month for a site_contract from a project's dates:
// term_start_date/term_end_date, falling back to expected_cod + delivery_term_years.
function deriveTerm(project) {
  const ym = (d) => {
    if (!d) return null;
    const m = /^(\d{4})-(\d{2})/.exec(String(d));
    return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
  };
  let s = ym(project.term_start_date) || ym(project.expected_cod);
  let e = ym(project.term_end_date);
  if (!s) s = { year: new Date().getFullYear(), month: 1 };
  if (!e) { const yrs = Number(project.delivery_term_years) || 10; e = { year: s.year + yrs, month: 12 }; }
  return { s, e };
}

// Flow-through: an existing-contract project (origin='existing') is mirrored into
// public.site_contracts (one row per assigned facility, origin='existing',
// status='accepted') so it charts against the customer's load. The project row
// stays the editable source of truth; this re-syncs on every create/update.
async function syncExistingContractToSiteContracts(project, facilities, req) {
  const { rows: prods } = await query(
    'SELECT * FROM planning.project_products WHERE iso_id = $1', [project.id],
  );
  const cap = prods.find((p) => p.product_type === 'capacity');
  const egy = prods.find((p) => p.product_type === 'energy');
  const rec = prods.find((p) => p.product_type === 'rec');
  const hasCap = !!cap, hasEgy = !!egy, hasRec = !!rec;

  // Resolve target facilities: explicit assignment, else preserve the existing
  // assignment (so a plain edit re-syncs the same facilities).
  let facs = Array.isArray(facilities) ? facilities.filter((f) => f && f.fac_id) : [];
  if (facs.length === 0) {
    const { rows: existing } = await query(
      "SELECT DISTINCT fac_id FROM site_contracts WHERE project_id = $1 AND origin = 'existing'", [project.id],
    );
    facs = existing.map((r) => ({ fac_id: r.fac_id }));
  }

  await query("DELETE FROM site_contracts WHERE project_id = $1 AND origin = 'existing'", [project.id]);
  if (facs.length === 0) return;

  const n = facs.length;
  const pricePerMwh = numOrNull(egy?.price_per_mwh) ?? numOrNull(project.fixed_price_per_mwh);
  const pricePerMwDay = numOrNull(cap?.price_per_mw_day) ?? numOrNull(project.capacity_price_per_mw_day);
  const lda = project.zone || null;
  const lmpNode = project.settlement_point || project.zone || null;
  const shape = defaultShapeForGenType(project.generation_type);
  const term = deriveTerm(project);
  const capTotal = numOrNull(cap?.capacity_mw) ?? numOrNull(project.capacity_mw);
  const egyMaxTotal = numOrNull(egy?.energy_mwh_max);
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

  for (const f of facs) {
    let capMw = numOrNull(f.capacity_mw);
    let egyMwh = numOrNull(f.energy_mwh);
    if (capMw == null && egyMwh == null) {
      // Even split across facilities, by whichever components the project offers.
      if (hasCap || (!hasEgy && !hasRec)) capMw = capTotal != null ? r2(capTotal / n) : null;
      if (hasEgy) {
        const total = egyMaxTotal != null ? egyMaxTotal : (numOrNull(project.capacity_mw) != null ? Number(project.capacity_mw) * 8760 : null);
        egyMwh = total != null ? r2(total / n) : null;
      }
    }
    // site_contracts requires at least one of capacity / energy / rec.
    if (capMw == null && egyMwh == null && !hasRec) {
      capMw = capTotal != null ? r2(capTotal / n) : 0;
    }
    await query(
      `INSERT INTO site_contracts
        (buyer_id, owner_company_id, fac_id, project_id, project_name, generation_type,
         capacity_mw, energy_mwh, price_per_mwh, price_per_mw_day, lda, lmp_node, shape,
         start_year, start_month, end_year, end_month,
         rec_pct, retiring_agency, matching_format,
         origin, status, committed, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'existing','accepted',true,'{}'::jsonb)`,
      [
        req.user.id, req.user.companyId ?? null, f.fac_id, project.id, project.name, project.generation_type,
        capMw, egyMwh, pricePerMwh, pricePerMwDay, lda, lmpNode, shape,
        term.s.year, term.s.month, term.e.year, term.e.month,
        hasRec ? numOrNull(rec.rec_pct) : null, hasRec ? rec.retiring_agency : null, hasRec ? rec.matching_format : null,
      ],
    );
  }
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
    // Visibility scope (admins see all; others see published marketplace + own company).
    const params = [];
    const where = [];
    if (req.user.role !== 'admin') {
      params.push(req.user.companyId);
      where.push(`((visibility = 'marketplace' AND status = 'published') OR (owner_company_id IS NOT NULL AND owner_company_id = $${params.length}))`);
    }
    // Optional filters so both marketplace offerings and existing contracts can be
    // queried together: ?origin=&iso=&zone=&generation_type=&visibility=
    for (const col of ['origin', 'iso', 'zone', 'generation_type', 'visibility']) {
      const val = req.query[col];
      if (val != null && val !== '') {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows: projects } = await query(
      `SELECT * FROM projects ${whereSql} ORDER BY created_at DESC`,
      params,
    );
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
      origin = 'marketplace', facilities, products,
    } = req.body;

    if (!name || !generation_type || !capacity_mw) {
      return res.status(400).json({ error: 'Missing required fields: name, generation_type, capacity_mw' });
    }

    // An existing-contract entry is always private to the owning company. Otherwise
    // admins & sellers may publish to the marketplace; everyone else stays private.
    const isExisting = origin === 'existing';
    const canPublishMarketplace = req.user.role === 'admin' || req.user.role === 'seller';
    const requestedMarketplace = !isExisting && canPublishMarketplace && (req.body.visibility ?? 'marketplace') === 'marketplace';
    const visibility = requestedMarketplace ? 'marketplace' : 'private';
    const owner_company_id = visibility === 'private' ? req.user.companyId : null;

    const insertData = {
      seller_id: req.user.id, name, generation_type, capacity_mw, location, metadata, status,
      visibility, owner_company_id, origin: isExisting ? 'existing' : 'marketplace',
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

    // Persist unbundled products (folded into the Edit form) before the flow-through
    // so an existing contract's site_contracts derive from fresh product data.
    if (products) await upsertProjectProducts(rows[0].id, products);
    // Existing contracts flow through to site_contracts so they chart against load.
    if (isExisting) await syncExistingContractToSiteContracts(rows[0], facilities, req);

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
      origin, facilities, products,
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (origin !== undefined) updateData.origin = origin;
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

    // Persist unbundled products first so the flow-through derives from fresh data.
    if (products) await upsertProjectProducts(rows[0].id, products);
    // Re-sync the flow-through whenever an existing-contract project changes
    // (term/price/products/facilities) so its charted site_contracts stay current.
    if (rows[0].origin === 'existing') await syncExistingContractToSiteContracts(rows[0], facilities, req);

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
    // Remove any flow-through existing-contract rows first (project_id would
    // otherwise be nulled by the FK and leave orphaned charted contracts).
    await query("DELETE FROM site_contracts WHERE project_id = $1 AND origin = 'existing'", [req.params.id]);
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
