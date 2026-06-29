import express from 'express';
import { query } from '../services/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

const HOURS_PER_YEAR = 8760;
const n = (v) => (v == null ? 0 : Number(v));
const r1 = (v) => Math.round(v * 10) / 10;

// GET /api/admin/portfolio — PowerDime admin view of the generation pool:
// per project (and rolled up) total / contracted-by-company / available
// capacity (MW) and energy (MWh/yr). Available = total − Σ contracted across all companies.
router.get('/portfolio', authenticate, requireRole(['admin']), async (_req, res) => {
  try {
    const { rows: projects } = await query(
      `SELECT id, name, generation_type, capacity_mw, visibility, status
         FROM projects ORDER BY name`
    );

    // Contracted volume per project, attributed to the committing company
    // (site_contracts.buyer_id → company_members → companies).
    const { rows: contracted } = await query(
      `SELECT sc.project_id,
              COALESCE(co.name, 'Unknown') AS company,
              SUM(COALESCE(sc.capacity_mw, 0)) AS cap_mw,
              SUM(COALESCE(sc.energy_mwh, 0)) AS energy_mwh
         FROM site_contracts sc
         LEFT JOIN company_members cm ON cm.user_id = sc.buyer_id
         LEFT JOIN companies co ON co.id = cm.company_id
        WHERE sc.project_id IS NOT NULL
        GROUP BY sc.project_id, co.name`
    );

    const byProject = new Map(); // project_id → [{ company, cap_mw, energy_mwh }]
    for (const row of contracted) {
      if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
      byProject.get(row.project_id).push({
        company: row.company,
        capacity_mw: n(row.cap_mw),
        energy_mwh: n(row.energy_mwh),
      });
    }

    const projectRows = projects.map((p) => {
      const totalCap = n(p.capacity_mw);
      const totalEnergy = totalCap * HOURS_PER_YEAR;
      const companies = byProject.get(p.id) ?? [];
      const contractedCap = companies.reduce((s, c) => s + c.capacity_mw, 0);
      const contractedEnergy = companies.reduce((s, c) => s + c.energy_mwh, 0);
      return {
        id: p.id,
        name: p.name,
        generation_type: p.generation_type,
        visibility: p.visibility,
        status: p.status,
        total_capacity_mw: r1(totalCap),
        total_energy_mwh: r1(totalEnergy),
        contracted_capacity_mw: r1(contractedCap),
        contracted_energy_mwh: r1(contractedEnergy),
        available_capacity_mw: r1(Math.max(0, totalCap - contractedCap)),
        available_energy_mwh: r1(Math.max(0, totalEnergy - contractedEnergy)),
        by_company: companies
          .map((c) => ({ company: c.company, capacity_mw: r1(c.capacity_mw), energy_mwh: r1(c.energy_mwh) }))
          .sort((a, b) => b.capacity_mw - a.capacity_mw || b.energy_mwh - a.energy_mwh),
      };
    });

    const totals = projectRows.reduce(
      (acc, p) => ({
        total_capacity_mw: acc.total_capacity_mw + p.total_capacity_mw,
        total_energy_mwh: acc.total_energy_mwh + p.total_energy_mwh,
        contracted_capacity_mw: acc.contracted_capacity_mw + p.contracted_capacity_mw,
        contracted_energy_mwh: acc.contracted_energy_mwh + p.contracted_energy_mwh,
        available_capacity_mw: acc.available_capacity_mw + p.available_capacity_mw,
        available_energy_mwh: acc.available_energy_mwh + p.available_energy_mwh,
      }),
      { total_capacity_mw: 0, total_energy_mwh: 0, contracted_capacity_mw: 0, contracted_energy_mwh: 0, available_capacity_mw: 0, available_energy_mwh: 0 }
    );
    for (const k of Object.keys(totals)) totals[k] = r1(totals[k]);

    res.json({ totals, projects: projectRows });
  } catch (err) {
    console.error('Admin portfolio error:', err);
    res.status(500).json({ error: 'Failed to build portfolio' });
  }
});

export default router;
