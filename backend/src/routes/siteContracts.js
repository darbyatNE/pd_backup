import express from 'express';
import { query } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /api/site-contracts?fac_id=...
// Returns the authenticated buyer's saved contracts. Optionally filtered to one
// data center (fac_id). The load chart fetches these and renders them.
router.get('/', authenticate, async (req, res) => {
  try {
    const { fac_id } = req.query;
    let sql = 'SELECT * FROM site_contracts WHERE buyer_id = $1';
    const params = [req.user.id];
    if (fac_id) {
      sql += ' AND fac_id = $2';
      params.push(fac_id);
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ contracts: rows });
  } catch (err) {
    console.error('Get site contracts error:', err);
    res.status(500).json({ error: 'Failed to fetch site contracts' });
  }
});

// POST /api/site-contracts — save a contract from the "Examine Fit" view.
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      fac_id,
      project_id = null,
      project_name,
      generation_type,
      capacity_mw = null,
      energy_mwh = null,
      price_per_mwh = null,
      price_per_mw_day = null,
      lda = null,
      shape = 'flat',
      start_year,
      start_month,
      end_year,
      end_month,
      // Unbundled REC component (optional)
      rec_pct = null,
      retiring_agency = null,
      matching_format = null,
      metadata = {},
    } = req.body;

    if (!fac_id || !project_name || !generation_type) {
      return res.status(400).json({ error: 'fac_id, project_name and generation_type are required' });
    }
    if (capacity_mw == null && energy_mwh == null && retiring_agency == null) {
      return res.status(400).json({ error: 'Specify at least one component: capacity (MW), energy (MWh), or RECs' });
    }
    if (!start_year || !start_month || !end_year || !end_month) {
      return res.status(400).json({ error: 'A full term (start and end year/month) is required' });
    }

    const { rows } = await query(
      `INSERT INTO site_contracts
        (buyer_id, fac_id, project_id, project_name, generation_type,
         capacity_mw, energy_mwh, price_per_mwh, price_per_mw_day, lda, shape,
         start_year, start_month, end_year, end_month,
         rec_pct, retiring_agency, matching_format, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        req.user.id, fac_id, project_id, project_name, generation_type,
        capacity_mw, energy_mwh, price_per_mwh, price_per_mw_day, lda, shape,
        start_year, start_month, end_year, end_month,
        rec_pct, retiring_agency, matching_format, JSON.stringify(metadata),
      ]
    );
    res.status(201).json({ contract: rows[0] });
  } catch (err) {
    console.error('Create site contract error:', err);
    res.status(500).json({ error: 'Failed to save site contract' });
  }
});

// PUT /api/site-contracts/:id/commit — make a contract permanent (non-removable).
router.put('/:id/commit', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE site_contracts SET committed = true, updated_at = NOW() WHERE id = $1 AND buyer_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json({ contract: rows[0] });
  } catch (err) {
    console.error('Commit site contract error:', err);
    res.status(500).json({ error: 'Failed to commit site contract' });
  }
});

// DELETE /api/site-contracts/:id — only drafts; committed contracts are permanent.
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query(
      'SELECT committed FROM site_contracts WHERE id = $1 AND buyer_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    if (existing.rows[0].committed) {
      return res.status(409).json({ error: 'Committed contracts are permanent and cannot be removed' });
    }
    await query('DELETE FROM site_contracts WHERE id = $1 AND buyer_id = $2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete site contract error:', err);
    res.status(500).json({ error: 'Failed to delete site contract' });
  }
});

export default router;
