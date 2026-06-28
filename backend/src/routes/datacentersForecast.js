import express from 'express';
import { query, buildUpdateSet } from '../services/db.js';

const router = express.Router();

const SCENARIOS = ['BASE', 'HIGH', 'LOW'];
const YEARS = 10;
const MONTHS = 12;
const HOURS_PER_YEAR = 8760;

// Bulk-replace monthly forecast rows for a datacenter.
// proj shape: { BASE: number[10][12], HIGH: ..., LOW: ... }
async function saveMonthlyForecast(datacenter_id, { p_it_proj, pue_proj, p_gross_proj, p_net_avg_month }) {
  if (!p_it_proj || !pue_proj || !p_gross_proj || !p_net_avg_month) return;

  const dcIds = [], scens = [], yearIdxs = [], monthIdxs = [];
  const pItVals = [], pueVals = [], pGrossVals = [], pNetVals = [];

  for (const s of SCENARIOS) {
    for (let y = 0; y < YEARS; y++) {
      for (let m = 0; m < MONTHS; m++) {
        dcIds.push(datacenter_id);
        scens.push(s);
        yearIdxs.push(y);
        monthIdxs.push(m);
        pItVals.push(p_it_proj?.[s]?.[y]?.[m] ?? null);
        pueVals.push(pue_proj?.[s]?.[y]?.[m] ?? null);
        pGrossVals.push(p_gross_proj?.[s]?.[y]?.[m] ?? null);
        pNetVals.push(p_net_avg_month?.[s]?.[y]?.[m] ?? null);
      }
    }
  }

  await query(
    `INSERT INTO datacenter_forecast_monthly
       (datacenter_id, scenario, year_idx, month_idx, p_it_proj, pue_proj, p_gross_proj, p_net_avg)
     SELECT * FROM unnest(
       $1::uuid[], $2::text[], $3::smallint[], $4::smallint[],
       $5::float8[], $6::float8[], $7::float8[], $8::float8[]
     )
     ON CONFLICT (datacenter_id, scenario, year_idx, month_idx)
     DO UPDATE SET
       p_it_proj    = EXCLUDED.p_it_proj,
       pue_proj     = EXCLUDED.pue_proj,
       p_gross_proj = EXCLUDED.p_gross_proj,
       p_net_avg    = EXCLUDED.p_net_avg`,
    [dcIds, scens, yearIdxs, monthIdxs, pItVals, pueVals, pGrossVals, pNetVals],
  );
}

// GET /api/datacenters-forecast/:datacenter_id
router.get('/:datacenter_id', async (req, res) => {
  try {
    const { datacenter_id } = req.params;
    const { rows } = await query(
      'SELECT * FROM datacenters_forecast WHERE datacenter_id = $1',
      [datacenter_id]
    );
    res.json({ data: rows[0] ?? null });
  } catch (err) {
    console.error('Forecast fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/datacenters-forecast/:datacenter_id/monthly
router.get('/:datacenter_id/monthly', async (req, res) => {
  try {
    const { datacenter_id } = req.params;
    const { rows } = await query(
      `SELECT * FROM datacenter_forecast_monthly
       WHERE datacenter_id = $1
       ORDER BY scenario, year_idx, month_idx`,
      [datacenter_id]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('Monthly forecast fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/datacenters-forecast/:datacenter_id/hourly?scenario=BASE&year_idx=0
router.get('/:datacenter_id/hourly', async (req, res) => {
  try {
    const { datacenter_id } = req.params;
    const { scenario = 'BASE', year_idx = '0' } = req.query;
    const { rows } = await query(
      `SELECT hour_of_year, p_it, ppue, p_gross, p_net
       FROM datacenter_forecast_hourly
       WHERE datacenter_id = $1 AND scenario = $2 AND year_idx = $3
       ORDER BY hour_of_year`,
      [datacenter_id, scenario, parseInt(year_idx, 10)]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('Hourly forecast fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/datacenters-forecast — upsert main forecast row + monthly breakdown
router.post('/', async (req, res) => {
  try {
    const {
      datacenter_id, buyer_id,
      p_it_proj, pue_proj, p_gross_proj, p_net_avg_month,
      e_annual_proj, p_net_peak_proj, uncont_exp_proj, ccr_annual_proj,
      alerts,
    } = req.body;

    if (!datacenter_id || !buyer_id) {
      return res.status(400).json({ error: 'datacenter_id and buyer_id are required' });
    }

    const { rows: existing } = await query(
      'SELECT id FROM datacenters_forecast WHERE datacenter_id = $1',
      [datacenter_id]
    );

    let rows;
    if (existing.length > 0) {
      const updatePayload = {
        buyer_id,
        p_it_proj, pue_proj, p_gross_proj, p_net_avg_month,
        e_annual_proj, p_net_peak_proj, uncont_exp_proj, ccr_annual_proj,
        alerts: alerts ?? [],
        calculated_at: new Date(),
        updated_at: new Date(),
      };
      const { setClause, values } = buildUpdateSet(updatePayload);
      ({ rows } = await query(
        `UPDATE datacenters_forecast SET ${setClause} WHERE datacenter_id = $${values.length + 1} RETURNING *`,
        [...values, datacenter_id]
      ));
    } else {
      ({ rows } = await query(
        `INSERT INTO datacenters_forecast
           (datacenter_id, buyer_id, p_it_proj, pue_proj, p_gross_proj, p_net_avg_month,
            e_annual_proj, p_net_peak_proj, uncont_exp_proj, ccr_annual_proj, alerts, calculated_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          datacenter_id, buyer_id,
          JSON.stringify(p_it_proj), JSON.stringify(pue_proj),
          JSON.stringify(p_gross_proj), JSON.stringify(p_net_avg_month),
          JSON.stringify(e_annual_proj), JSON.stringify(p_net_peak_proj),
          JSON.stringify(uncont_exp_proj), JSON.stringify(ccr_annual_proj),
          alerts ?? [],
          new Date(), new Date(),
        ]
      ));
    }

    // Normalize into datacenter_forecast_monthly (non-blocking)
    saveMonthlyForecast(datacenter_id, { p_it_proj, pue_proj, p_gross_proj, p_net_avg_month })
      .catch(err => console.error('Monthly forecast save error:', err.message, err.detail ?? ''));

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error('Internal error:', err);
    res.status(500).json({ error: 'Failed to save forecast' });
  }
});

// POST /api/datacenters-forecast/:datacenter_id/hourly
// Body: { hourly: { BASE: { p_it: number[][], ppue: number[][], p_gross: number[][], p_net: number[][] }, HIGH: ..., LOW: ... } }
// Inner arrays indexed [year_idx][hour_of_year]. Batched one (scenario, year) at a time.
router.post('/:datacenter_id/hourly', async (req, res) => {
  try {
    const { datacenter_id } = req.params;
    const { hourly } = req.body;

    if (!hourly) return res.status(400).json({ error: 'hourly payload required' });

    // Build all rows for all scenarios × years in one pass, then insert in
    // a single unnest() call (1 round-trip instead of 30).
    const totalRows = SCENARIOS.length * YEARS * HOURS_PER_YEAR;
    const dcIds     = new Array(totalRows);
    const scens     = new Array(totalRows);
    const yearIdxs  = new Array(totalRows);
    const hourIdxs  = new Array(totalRows);
    const pItVals   = new Array(totalRows);
    const ppueVals  = new Array(totalRows);
    const pGrossVals = new Array(totalRows);
    const pNetVals  = new Array(totalRows);

    let idx = 0;
    for (const scenario of SCENARIOS) {
      const sd = hourly[scenario];
      if (!sd) continue;
      for (let y = 0; y < YEARS; y++) {
        const pItYear = sd.p_it?.[y];
        if (!pItYear || pItYear.length < HOURS_PER_YEAR) continue;
        for (let h = 0; h < HOURS_PER_YEAR; h++) {
          dcIds[idx]      = datacenter_id;
          scens[idx]      = scenario;
          yearIdxs[idx]   = y;
          hourIdxs[idx]   = h;
          pItVals[idx]    = sd.p_it[y][h]    ?? null;
          ppueVals[idx]   = sd.ppue[y][h]    ?? null;
          pGrossVals[idx] = sd.p_gross[y][h] ?? null;
          pNetVals[idx]   = sd.p_net[y][h]   ?? null;
          idx++;
        }
      }
    }

    // Trim to actual populated rows (in case any scenario/year was skipped)
    const filled = idx;
    await query(
      `INSERT INTO datacenter_forecast_hourly
         (datacenter_id, scenario, year_idx, hour_of_year, p_it, ppue, p_gross, p_net)
       SELECT * FROM unnest(
         $1::uuid[], $2::text[], $3::smallint[], $4::smallint[],
         $5::float8[], $6::float8[], $7::float8[], $8::float8[]
       )
       ON CONFLICT (datacenter_id, scenario, year_idx, hour_of_year)
       DO UPDATE SET
         p_it    = EXCLUDED.p_it,
         ppue    = EXCLUDED.ppue,
         p_gross = EXCLUDED.p_gross,
         p_net   = EXCLUDED.p_net`,
      [
        dcIds.slice(0, filled),   scens.slice(0, filled),
        yearIdxs.slice(0, filled), hourIdxs.slice(0, filled),
        pItVals.slice(0, filled),  ppueVals.slice(0, filled),
        pGrossVals.slice(0, filled), pNetVals.slice(0, filled),
      ],
    );

    res.json({ ok: true, message: 'Hourly forecast saved' });
  } catch (err) {
    console.error('Hourly forecast save error:', err.message, err.detail ?? '', err.hint ?? '');
    res.status(500).json({ error: 'Failed to save hourly forecast', detail: err.message });
  }
});

export default router;
