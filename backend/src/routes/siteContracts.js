import express from 'express';
import { query } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Rows are scoped to the user OR their company (company-wide ownership). The
// committed/accepted contracts of a company chart against that company's load.
const scopeClause = (startIdx) =>
  `(buyer_id = $${startIdx} OR (owner_company_id IS NOT NULL AND owner_company_id = $${startIdx + 1}))`;

// GET /api/site-contracts?fac_id=...&ledger=1
// Default: the company's (and user's) non-rejected contracts — feeds the load
// chart and "Contracted" sections. ledger=1: ALL statuses incl. rejected, for
// the Transactions tab.
router.get('/', authenticate, async (req, res) => {
  try {
    const { fac_id, ledger } = req.query;
    const params = [req.user.id, req.user.companyId ?? null];
    let sql = `SELECT * FROM site_contracts WHERE ${scopeClause(1)}`;
    if (!ledger) sql += " AND status <> 'rejected'";
    if (fac_id) {
      params.push(fac_id);
      sql += ` AND fac_id = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ contracts: rows });
  } catch (err) {
    console.error('Get site contracts error:', err);
    res.status(500).json({ error: 'Failed to fetch site contracts' });
  }
});

// POST /api/site-contracts — save a contract.
//   origin 'pursued'  (default, from Examine-Fit) → status 'pending'
//   origin 'existing' (onboarding import)         → status 'accepted' (charted)
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
      lmp_node = null,
      shape = 'flat',
      start_year,
      start_month,
      end_year,
      end_month,
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

    const origin = req.body.origin === 'existing' ? 'existing' : 'pursued';
    const status = origin === 'existing' ? 'accepted' : 'pending';
    const committed = origin === 'existing';

    const { rows } = await query(
      `INSERT INTO site_contracts
        (buyer_id, owner_company_id, fac_id, project_id, project_name, generation_type,
         capacity_mw, energy_mwh, price_per_mwh, price_per_mw_day, lda, lmp_node, shape,
         start_year, start_month, end_year, end_month,
         rec_pct, retiring_agency, matching_format,
         origin, status, committed, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        req.user.id, req.user.companyId ?? null, fac_id, project_id, project_name, generation_type,
        capacity_mw, energy_mwh, price_per_mwh, price_per_mw_day, lda, lmp_node, shape,
        start_year, start_month, end_year, end_month,
        rec_pct, retiring_agency, matching_format,
        origin, status, committed, JSON.stringify(metadata),
      ]
    );
    res.status(201).json({ contract: rows[0] });
  } catch (err) {
    console.error('Create site contract error:', err);
    res.status(500).json({ error: 'Failed to save site contract' });
  }
});

// Status transitions. commit → 'committed' (enters the Transactions tab for a
// decision); accept → 'accepted' (permanent, charted); reject → 'rejected'
// (soft archive: hidden from chart/committed view, retained).
const transition = (status, committed) => async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE site_contracts
          SET status = $1, committed = $2, decided_at = NOW(), decided_by = $3, updated_at = NOW()
        WHERE id = $4 AND ${scopeClause(5)}
        RETURNING *`,
      [status, committed, req.user.id, req.params.id, req.user.id, req.user.companyId ?? null]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json({ contract: rows[0] });
  } catch (err) {
    console.error(`Transition (${status}) site contract error:`, err);
    res.status(500).json({ error: `Failed to set contract status to ${status}` });
  }
};

router.put('/:id/commit', authenticate, transition('committed', true));
router.put('/:id/accept', authenticate, transition('accepted', true));
router.put('/:id/reject', authenticate, transition('rejected', false));

// DELETE /api/site-contracts/:id — only pending drafts can be hard-deleted;
// anything past 'pending' is archived via reject instead.
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query(
      `SELECT status FROM site_contracts WHERE id = $1 AND ${scopeClause(2)}`,
      [req.params.id, req.user.id, req.user.companyId ?? null]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    if (existing.rows[0].status !== 'pending') {
      return res.status(409).json({ error: 'Only pending drafts can be deleted; reject to archive committed contracts' });
    }
    await query(`DELETE FROM site_contracts WHERE id = $1 AND ${scopeClause(2)}`,
      [req.params.id, req.user.id, req.user.companyId ?? null]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete site contract error:', err);
    res.status(500).json({ error: 'Failed to delete site contract' });
  }
});

export default router;
