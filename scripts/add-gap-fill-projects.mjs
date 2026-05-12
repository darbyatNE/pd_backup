// Inserts 12 smaller, geographically-diverse projects across PJM that buyers
// can use to fill in gaps in their hedged-volume position. Mix of Solar,
// Wind, Battery, Hybrid, Combined Cycle, and Peaker — sized 6–50 MW with
// shorter delivery terms (10–15 yrs).

const SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeGt5a3VwanBwem1zY252ZXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgwNTkxMSwiZXhwIjoyMDkyMzgxOTExfQ.exzUVTdsiDDJGKnSOnzFCQCzFIGa_uwIvrkuvZLbvGs';

const SELLER_ID = 'b6770792-6cbb-4f79-86d3-9b4ecf53433a';

const PROJECTS = [
  // ── Small Solar ────────────────────────────────────────────────────────
  {
    name: 'Loudoun Solar Garden',
    generation_type: 'Solar',
    capacity_mw: 12,
    location: 'Loudoun County, Virginia',
    settlement_point: 'DOM',
    fixed_price_per_mwh: 58,
    expected_cod: '2026-08-01',
    guaranteed_cod: '2026-12-31',
    delivery_term_years: 12,
    description: '12 MW community solar in Loudoun County, VA. Daytime shape — pairs well with NoVA data-center load coincidence.',
  },
  {
    name: 'Mercer County Solar',
    generation_type: 'Solar',
    capacity_mw: 8,
    location: 'Mercer County, New Jersey',
    settlement_point: 'PSEG',
    fixed_price_per_mwh: 62,
    expected_cod: '2026-09-15',
    guaranteed_cod: '2027-03-31',
    delivery_term_years: 10,
    description: '8 MW DG-scale solar in PSEG zone, Mercer County, NJ.',
  },
  {
    name: 'Lehigh Valley Solar',
    generation_type: 'Solar',
    capacity_mw: 15,
    location: 'Northampton County, Pennsylvania',
    settlement_point: 'METED',
    fixed_price_per_mwh: 48,
    expected_cod: '2026-07-01',
    guaranteed_cod: '2026-12-31',
    delivery_term_years: 15,
    description: '15 MW solar in METED zone, Lehigh Valley, PA.',
  },
  {
    name: 'Cumberland Solar',
    generation_type: 'Solar',
    capacity_mw: 10,
    location: 'Cumberland County, Pennsylvania',
    settlement_point: 'PPL',
    fixed_price_per_mwh: 52,
    expected_cod: '2026-10-01',
    guaranteed_cod: '2027-04-30',
    delivery_term_years: 12,
    description: '10 MW solar in PPL zone, Cumberland County, PA.',
  },

  // ── Small Wind ─────────────────────────────────────────────────────────
  {
    name: 'Garrett Ridge Wind',
    generation_type: 'Wind',
    capacity_mw: 18,
    location: 'Garrett County, MD (APS)',
    settlement_point: 'APS',
    fixed_price_per_mwh: 45,
    expected_cod: '2026-11-01',
    guaranteed_cod: '2027-06-30',
    delivery_term_years: 15,
    description: '18 MW ridge wind in APS zone, western Maryland.',
  },
  {
    name: 'Tucker Mountain Wind',
    generation_type: 'Wind',
    capacity_mw: 20,
    location: 'Tucker County, West Virginia',
    settlement_point: 'APS',
    fixed_price_per_mwh: 42,
    expected_cod: '2026-08-15',
    guaranteed_cod: '2027-02-28',
    delivery_term_years: 15,
    description: '20 MW ridge wind in APS zone, Tucker County, WV.',
  },

  // ── Small Battery (BESS) ───────────────────────────────────────────────
  {
    name: 'Newark BESS',
    generation_type: 'Battery',
    capacity_mw: 6,
    location: 'Newark, New Jersey',
    settlement_point: 'PSEG',
    fixed_price_per_mwh: 35,
    expected_cod: '2026-06-15',
    guaranteed_cod: '2026-09-30',
    delivery_term_years: 10,
    description: '6 MW / 4-hr battery in PSEG zone, Newark, NJ. Fills evening peak gap.',
  },
  {
    name: 'Reston BESS',
    generation_type: 'Battery',
    capacity_mw: 10,
    location: 'Reston, Virginia',
    settlement_point: 'DOM',
    fixed_price_per_mwh: 38,
    expected_cod: '2026-07-01',
    guaranteed_cod: '2026-12-31',
    delivery_term_years: 10,
    description: '10 MW / 4-hr battery in DOM zone, Reston, VA. Pairs with NoVA solar gap-fill.',
  },

  // ── Small Peakers ──────────────────────────────────────────────────────
  {
    name: 'Camden Peaker',
    generation_type: 'Peaker',
    capacity_mw: 25,
    location: 'Camden County, New Jersey',
    settlement_point: 'PSEG',
    fixed_price_per_mwh: 95,
    expected_cod: '2026-05-01',
    guaranteed_cod: '2026-09-30',
    delivery_term_years: 15,
    description: '25 MW simple-cycle gas peaker in PSEG zone, Camden County, NJ.',
  },
  {
    name: 'Wilmington Mini-NG',
    generation_type: 'Peaker',
    capacity_mw: 15,
    location: 'New Castle County, Delaware',
    settlement_point: 'DPL',
    fixed_price_per_mwh: 90,
    expected_cod: '2026-06-01',
    guaranteed_cod: '2026-11-30',
    delivery_term_years: 12,
    description: '15 MW mini-NG peaking unit in DPL zone, New Castle County, DE.',
  },

  // ── Mid-size Combined Cycle ────────────────────────────────────────────
  {
    name: 'Marcus Hook CCGT II',
    generation_type: 'Combined Cycle',
    capacity_mw: 50,
    location: 'Delaware County, Pennsylvania',
    settlement_point: 'PECO',
    fixed_price_per_mwh: 55,
    expected_cod: '2027-01-01',
    guaranteed_cod: '2027-06-30',
    delivery_term_years: 15,
    description: '50 MW CCGT module in PECO zone, Marcus Hook, PA.',
  },

  // ── Hybrid ─────────────────────────────────────────────────────────────
  {
    name: 'Front Royal Hybrid',
    generation_type: 'Hybrid',
    capacity_mw: 22,
    location: 'Warren County, Virginia',
    settlement_point: 'DOM',
    fixed_price_per_mwh: 50,
    expected_cod: '2026-09-01',
    guaranteed_cod: '2027-03-31',
    delivery_term_years: 15,
    description: '22 MW solar + 4-hr battery hybrid in DOM zone, Warren County, VA.',
  },
];

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

let ok = 0, fail = 0;
for (const p of PROJECTS) {
  const body = {
    seller_id: SELLER_ID,
    name: p.name,
    generation_type: p.generation_type,
    capacity_mw: p.capacity_mw,
    location: p.location,
    settlement_point: p.settlement_point,
    fixed_price_per_mwh: p.fixed_price_per_mwh,
    eac_price_per_mwh: 0,
    price_currency: 'USD',
    annual_escalator_percent: 2.0,
    expected_cod: p.expected_cod,
    guaranteed_cod: p.guaranteed_cod,
    delivery_term_years: p.delivery_term_years,
    guaranteed_availability_year1_percent: 90,
    guaranteed_availability_ongoing_percent: 92,
    status: 'published',
    metadata: { description: p.description, gap_fill: true },
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (res.ok) {
    console.log(`✓  ${p.name} — ${p.generation_type} ${p.capacity_mw} MW @ ${p.settlement_point} ($${p.fixed_price_per_mwh}/MWh)`);
    ok++;
  } else {
    console.error(`✗  ${p.name}: ${res.status} ${await res.text()}`);
    fail++;
  }
}

console.log(`\n${ok} inserted, ${fail} failed.`);
