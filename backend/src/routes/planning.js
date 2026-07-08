import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { query } from '../services/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ── AI-guided finder: plain-language preferences → qualitative dials ─────────
// The tool's input schema IS the dial set, and we force the model to call it, so
// the response is always valid structured output — no free-text parsing.
// Integer 0–100 dials. NOTE: strict structured outputs reject numeric
// constraints (minimum/maximum), so the range lives in the description and the
// value is clamped server-side.
const DIAL_PROPS = {
  locality:       { type: 'integer', description: "0–100. How locationally aligned the deal must be. Proximity is judged by pricing point for energy (the LMP settlement zone/node) and by capacity zone (LDA) for capacity — not physical miles. 0 = anywhere in the market, 50 = same ISO/market, 100 = must sit in the site's own pricing point / capacity zone" },
  priceAppetite:  { type: 'integer', description: '0–100. 0 = bargain hunter (cheapest only), 100 = premium OK / price irrelevant' },
  termCommitment: { type: 'integer', description: '0–100. 0 = any term overlap is fine, 100 = must cover the whole service window' },
  dealSize:       { type: 'integer', description: '0–100. 0 = small/flexible deals, 100 = large anchor deals only' },
  cleanEnergy:    { type: 'integer', description: '0–100. 0 = cost-first, any generation source, 100 = green-first (renewables only)' },
  readiness:      { type: 'integer', description: '0–100. 0 = must be available now, 100 = future/planned builds are fine' },
  priority:       { type: 'integer', description: '0–100. 0 = optimize for best price, 100 = optimize for best fit (closest/highest quality)' },
  needEnergy:     { type: 'integer', description: '0–100 for the ENERGY component. 0 = exclude (only contracts without energy), 50 = indifferent, 100 = require (must supply energy)' },
  needCapacity:   { type: 'integer', description: '0–100 for the CAPACITY component. 0 = exclude (only contracts without capacity), 50 = indifferent, 100 = require (must supply capacity)' },
  needRec:        { type: 'integer', description: '0–100 for RECs / green attributes. 0 = exclude (only contracts without RECs), 50 = indifferent, 100 = require (must supply RECs)' },
};
const DIAL_KEYS = Object.keys(DIAL_PROPS);

// POST /api/planning/recommend-intent { text, facets?: { isos, genTypes } }
//   → { dials: {…0-100…}, note }
router.post('/recommend-intent', authenticate, async (req, res) => {
  try {
    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (!process.env.CLAUDE_API_KEY) {
      return res.status(502).json({ error: 'AI finder is not configured' });
    }
    const facets = req.body?.facets ?? {};
    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

    const tool = {
      name: 'set_preferences',
      description: 'Translate the buyer\'s described preferences into the qualitative preference dials.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...DIAL_PROPS,
          generationTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exact generation types the buyer explicitly named (e.g. ["Solar"] for "solar offers"). Use names from the available list only. Empty array [] when the buyer did not name a specific type — do NOT infer one from a general "green/clean" request (use the cleanEnergy dial for that).',
          },
          note: { type: 'string', description: 'One short sentence summarizing how you interpreted the request, e.g. "Green energy, nearby, price-sensitive, full-term".' },
        },
        required: [...DIAL_KEYS, 'generationTypes', 'note'],
      },
    };

    const genList = Array.isArray(facets.genTypes) ? facets.genTypes.join(', ') : 'unknown';
    const system =
      'You translate a data-center energy buyer\'s plain-language description of what kind of ' +
      'power contract they want into a set of 0–100 preference dials by calling the set_preferences tool. ' +
      'Infer each dial from the request; leave a dial near its neutral default (around 20–50) when the ' +
      'buyer does not mention that dimension. When the buyer names a specific generation type ' +
      '(e.g. "solar", "wind", "nuclear"), put the exact matching type(s) in generationTypes; otherwise leave it []. ' +
      'Available ISOs: ' + (Array.isArray(facets.isos) ? facets.isos.join(', ') : 'unknown') +
      '. Available generation types: ' + genList + '.';

    const resp = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'set_preferences' },
      messages: [{ role: 'user', content: text }],
    });

    const toolUse = resp.content.find((b) => b.type === 'tool_use');
    if (!toolUse) return res.status(502).json({ error: 'AI finder returned no preferences' });
    const input = toolUse.input ?? {};
    const dials = {};
    for (const k of DIAL_KEYS) {
      const v = Number(input[k]);
      dials[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 50;
    }
    // Keep only named types that exist in the available list (case-insensitive).
    const avail = Array.isArray(facets.genTypes) ? facets.genTypes : [];
    const availLower = new Map(avail.map((g) => [String(g).toLowerCase(), g]));
    const generationTypes = Array.isArray(input.generationTypes)
      ? [...new Set(input.generationTypes.map((g) => availLower.get(String(g).toLowerCase())).filter(Boolean))]
      : [];
    res.json({ dials, generationTypes, note: typeof input.note === 'string' ? input.note : '' });
  } catch (err) {
    console.error('recommend-intent error:', err);
    res.status(502).json({ error: 'AI finder is temporarily unavailable' });
  }
});

// GET /api/planning/site-attributes?buyer_id=...
// Per-site grouping attributes for the Planning-tab scope selector. Joins the
// data_centers row to its facilities record and the buyer's onboarding_details
// (onboarding_details.id === user id), plus aggregates the site's non-rejected
// site_contracts. Raw values are returned; bucketing (hedge band, load tier,
// PUE band, expiry cohorts) is done in the frontend dimension registry so the
// bucket thresholds live in one place.
router.get('/site-attributes', authenticate, async (req, res) => {
  try {
    const buyerId = req.query.buyer_id || req.user.id;
    const { rows } = await query(
      `SELECT
         dc."FAC_ID"            AS fac_id,
         dc."ISO"               AS iso,
         dc."STATE"             AS state,
         dc."UTIL"              AS utility,
         dc."LDA"               AS lda,
         dc."FACILITY_STATUS"   AS lifecycle,
         dc."IT_CAP"            AS it_cap,
         dc."IT_LOAD"           AS it_load,
         dc."PUE"               AS pue,
         dc."IC_EXP"            AS interconnection_expiry,
         dc."TRANS_AGREE"       AS transmission_agreement,
         f.country              AS country,
         f.city                 AS city,
         f.settlement_node_id   AS settlement_node,
         ob.net_zero_year               AS net_zero_year,
         ob.electricity_contract_type   AS procurement_strategy,
         ob.carbon_match_pref           AS carbon_match,
         sc.contracted_mwh      AS contracted_mwh,
         sc.earliest_contract_end AS earliest_contract_end,
         sc.generation_types    AS generation_types
       FROM data_centers dc
       LEFT JOIN facilities f          ON f.id = dc.facility_id
       LEFT JOIN onboarding_details ob ON ob.id = dc.buyer_id
       LEFT JOIN (
         SELECT fac_id,
                SUM(COALESCE(energy_mwh, 0)) AS contracted_mwh,
                MIN(end_year * 100 + end_month) AS earliest_contract_end,
                ARRAY_AGG(DISTINCT generation_type) AS generation_types
         FROM site_contracts
         WHERE status <> 'rejected'
         GROUP BY fac_id
       ) sc ON sc.fac_id = dc."FAC_ID"
       WHERE dc.buyer_id = $1`,
      [buyerId],
    );

    const attributes = {};
    for (const r of rows) {
      // MIN(end_year*100+end_month) → "YYYY-MM" for the frontend expiry cohort.
      let earliest = null;
      if (r.earliest_contract_end != null) {
        const v = Number(r.earliest_contract_end);
        earliest = `${Math.floor(v / 100)}-${String(v % 100).padStart(2, '0')}`;
      }
      attributes[r.fac_id] = {
        fac_id: r.fac_id,
        iso: r.iso ?? null,
        state: r.state ?? null,
        country: r.country ?? null,
        utility: r.utility ?? null,
        lda: r.lda ?? null,
        lifecycle: r.lifecycle ?? null,
        it_cap: r.it_cap == null ? null : Number(r.it_cap),
        it_load: r.it_load == null ? null : Number(r.it_load),
        pue: r.pue == null ? null : Number(r.pue),
        interconnection_expiry: r.interconnection_expiry ?? null,
        transmission_agreement: r.transmission_agreement ?? null,
        settlement_node: r.settlement_node ?? null,
        net_zero_year: r.net_zero_year == null ? null : Number(r.net_zero_year),
        procurement_strategy: r.procurement_strategy ?? null,
        carbon_match: r.carbon_match ?? null,
        contracted_mwh: r.contracted_mwh == null ? 0 : Number(r.contracted_mwh),
        earliest_contract_end: earliest,
        generation_types: (r.generation_types ?? []).filter(Boolean),
      };
    }
    res.json({ attributes });
  } catch (err) {
    console.error('Get site attributes error:', err);
    res.status(500).json({ error: 'Failed to fetch site attributes' });
  }
});

// Groups are scoped per user (buyer_id). Company-wide sharing is deferred to the
// platform owner's multi-user work — see note in the migration.

// GET /api/planning/groups — the user's saved groups with members.
router.get('/groups', authenticate, async (req, res) => {
  try {
    const { rows: groups } = await query(
      `SELECT id, name, color, description, buyer_id, created_at
         FROM dc_custom_groups
        WHERE buyer_id = $1
        ORDER BY created_at DESC`,
      [req.user.id],
    );
    if (groups.length === 0) return res.json({ groups: [] });
    const ids = groups.map((g) => g.id);
    // Members are stored as data_centers.id; return the UI's FAC_ID site key.
    const { rows: members } = await query(
      `SELECT m.group_id, dc."FAC_ID" AS fac_id
         FROM dc_group_members m
         JOIN data_centers dc ON dc.id = m.datacenter_id
        WHERE m.group_id = ANY($1)`,
      [ids],
    );
    const byGroup = {};
    for (const m of members) (byGroup[m.group_id] ??= []).push(m.fac_id);
    res.json({ groups: groups.map((g) => ({ ...g, members: byGroup[g.id] ?? [] })) });
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /api/planning/groups — create a named group from a set of site keys.
router.post('/groups', authenticate, async (req, res) => {
  try {
    const { name, color = null, description = null, members = [] } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      `INSERT INTO dc_custom_groups (buyer_id, name, color, description)
       VALUES ($1, $2, $3, $4) RETURNING id, name, color, description, created_at`,
      [req.user.id, name.trim(), color, description],
    );
    const group = rows[0];
    const uniqueFacIds = [...new Set((members || []).filter(Boolean))];
    // Members are stored by data_centers.id; map the incoming FAC_ID site keys
    // to their rows (only the user's own data centers can be grouped).
    let savedFacIds = [];
    if (uniqueFacIds.length > 0) {
      const { rows: dcs } = await query(
        `SELECT id, "FAC_ID" AS fac_id FROM data_centers
          WHERE "FAC_ID" = ANY($1) AND buyer_id = $2`,
        [uniqueFacIds, req.user.id],
      );
      for (const dc of dcs) {
        await query(
          `INSERT INTO dc_group_members (group_id, datacenter_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [group.id, dc.id],
        );
      }
      savedFacIds = dcs.map((d) => d.fac_id);
    }
    res.status(201).json({ group: { ...group, members: savedFacIds } });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// DELETE /api/planning/groups/:id — remove a group (members cascade).
router.delete('/groups/:id', authenticate, async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM dc_custom_groups WHERE id = $1 AND buyer_id = $2`,
      [req.params.id, req.user.id],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

export default router;
