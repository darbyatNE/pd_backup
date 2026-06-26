import express from 'express';
import { query } from '../services/db.js';

const router = express.Router();

// Public read endpoints that power the "Project Locations" map (Planning tab).
// These intentionally require no auth — they mirror the previous anonymous
// Supabase reads the map made directly from the browser, now sourced from the
// ISO data Postgres database instead.

// GET /api/map/projects - generation projects shown as map markers
router.get('/projects', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT *
         FROM projects
        WHERE status IN ('published', 'active')
        ORDER BY created_at DESC`
    );
    res.json({ projects: rows });
  } catch (error) {
    console.error('[map] fetch projects error', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/map/buyer-projects - load sites (buyer projects) shown as map markers
router.get('/buyer-projects', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, location, project_type, target_capacity_mw, settlement_zone
         FROM buyer_projects
        ORDER BY created_at DESC`
    );
    res.json({ buyerSites: rows });
  } catch (error) {
    console.error('[map] fetch buyer projects error', error);
    res.status(500).json({ error: 'Failed to fetch buyer projects' });
  }
});

// GET /api/map/lmp?year=YYYY&month=M - LMP forecast prices for a given month
router.get('/lmp', async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return res.status(400).json({ error: 'year and month query params are required integers' });
  }
  try {
    const { rows } = await query(
      `SELECT pnode_id, total_lmp
         FROM planning.lmp_forecast
        WHERE year = $1 AND month = $2`,
      [year, month]
    );
    res.json({ prices: rows });
  } catch (error) {
    console.error('[map] fetch lmp error', error);
    res.status(500).json({ error: 'Failed to fetch LMP prices' });
  }
});

export default router;
