import express from 'express';
import { query } from '../services/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Unbundled project products (Capacity / Energy / RECs), one row per product per
// project, stored in planning.project_products and keyed by iso_id (the ISO
// registry / project id). See migration 20260629_create_planning_project_products.

const RETIRING_AGENCIES = ['PJM-EIS GATS', 'M-RETS', 'NYGATS', 'NC-RETS', 'NEPOOL GIS', 'NAR'];
const MATCHING_FORMATS = ['yearly', 'monthly', '24x7'];
const num = (v) => (v === '' || v == null ? null : Number(v));

// GET /api/project-products/summary — all per-project summaries (one row each),
// so the project list can render the unbundled summary line.
router.get('/summary', authenticate, async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM planning.project_product_summary');
    res.json({ summaries: rows });
  } catch (error) {
    console.error('[project-products] summary error', error);
    res.status(500).json({ error: 'Failed to fetch product summaries' });
  }
});

// GET /api/project-products/:isoId — the (up to three) product rows + summary.
router.get('/:isoId', authenticate, async (req, res) => {
  try {
    const { isoId } = req.params;
    const { rows } = await query(
      'SELECT * FROM planning.project_products WHERE iso_id = $1 ORDER BY product_type',
      [isoId],
    );
    const summary = await query(
      'SELECT * FROM planning.project_product_summary WHERE iso_id = $1',
      [isoId],
    );
    res.json({ products: rows, summary: summary.rows[0] ?? null });
  } catch (error) {
    console.error('[project-products] fetch error', error);
    res.status(500).json({ error: 'Failed to fetch project products' });
  }
});

// PUT /api/project-products/:isoId — upsert the three product blocks.
// Body: { capacity|null, energy|null, rec|null }. A present block is upserted;
// an explicit null deletes that product; an absent key leaves it unchanged.
router.put('/:isoId', authenticate, requireRole(['admin', 'seller']), async (req, res) => {
  const { isoId } = req.params;
  const { capacity, energy, rec } = req.body ?? {};

  try {
    // Capacity — needs capacity_mw + eda
    if (capacity === null) {
      await query("DELETE FROM planning.project_products WHERE iso_id = $1 AND product_type = 'capacity'", [isoId]);
    } else if (capacity) {
      if (num(capacity.capacity_mw) == null || !capacity.eda) {
        return res.status(400).json({ error: 'Capacity requires capacity_mw and eda (EDA)' });
      }
      await query(
        `INSERT INTO planning.project_products (iso_id, product_type, capacity_mw, eda, price_per_mw_day)
         VALUES ($1, 'capacity', $2, $3, $4)
         ON CONFLICT (iso_id, product_type)
         DO UPDATE SET capacity_mw = EXCLUDED.capacity_mw, eda = EXCLUDED.eda,
                       price_per_mw_day = EXCLUDED.price_per_mw_day, updated_at = NOW()`,
        [isoId, num(capacity.capacity_mw), capacity.eda, num(capacity.price_per_mw_day)],
      );
    }

    // Energy — needs zone; optional min/max range
    if (energy === null) {
      await query("DELETE FROM planning.project_products WHERE iso_id = $1 AND product_type = 'energy'", [isoId]);
    } else if (energy) {
      if (!energy.zone) {
        return res.status(400).json({ error: 'Energy requires a zone' });
      }
      await query(
        `INSERT INTO planning.project_products (iso_id, product_type, energy_mwh_min, energy_mwh_max, zone, price_per_mwh)
         VALUES ($1, 'energy', $2, $3, $4, $5)
         ON CONFLICT (iso_id, product_type)
         DO UPDATE SET energy_mwh_min = EXCLUDED.energy_mwh_min, energy_mwh_max = EXCLUDED.energy_mwh_max,
                       zone = EXCLUDED.zone, price_per_mwh = EXCLUDED.price_per_mwh, updated_at = NOW()`,
        [isoId, num(energy.energy_mwh_min), num(energy.energy_mwh_max), energy.zone, num(energy.price_per_mwh)],
      );
    }

    // RECs — needs retiring_agency + matching_format; optional pct
    if (rec === null) {
      await query("DELETE FROM planning.project_products WHERE iso_id = $1 AND product_type = 'rec'", [isoId]);
    } else if (rec) {
      if (!RETIRING_AGENCIES.includes(rec.retiring_agency)) {
        return res.status(400).json({ error: `retiring_agency must be one of: ${RETIRING_AGENCIES.join(', ')}` });
      }
      if (!MATCHING_FORMATS.includes(rec.matching_format)) {
        return res.status(400).json({ error: `matching_format must be one of: ${MATCHING_FORMATS.join(', ')}` });
      }
      await query(
        `INSERT INTO planning.project_products (iso_id, product_type, rec_pct, retiring_agency, matching_format, price_per_mwh)
         VALUES ($1, 'rec', $2, $3, $4, $5)
         ON CONFLICT (iso_id, product_type)
         DO UPDATE SET rec_pct = EXCLUDED.rec_pct, retiring_agency = EXCLUDED.retiring_agency,
                       matching_format = EXCLUDED.matching_format, price_per_mwh = EXCLUDED.price_per_mwh, updated_at = NOW()`,
        [isoId, num(rec.rec_pct), rec.retiring_agency, rec.matching_format, num(rec.price_per_mwh)],
      );
    }

    const { rows } = await query(
      'SELECT * FROM planning.project_products WHERE iso_id = $1 ORDER BY product_type',
      [isoId],
    );
    const summary = await query(
      'SELECT * FROM planning.project_product_summary WHERE iso_id = $1',
      [isoId],
    );
    res.json({ products: rows, summary: summary.rows[0] ?? null });
  } catch (error) {
    console.error('[project-products] upsert error', error);
    res.status(500).json({ error: 'Failed to save project products' });
  }
});

export default router;
