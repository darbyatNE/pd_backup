// Inserts two combustion (natural gas) projects on the east side of PJM:
//  1. Hudson River Combined Cycle (NGCC) — PSEG zone, Bergen County, NJ
//  2. Atlantic Peaking Station (peaker) — AECO zone, Atlantic County, NJ

const SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeGt5a3VwanBwem1zY252ZXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgwNTkxMSwiZXhwIjoyMDkyMzgxOTExfQ.exzUVTdsiDDJGKnSOnzFCQCzFIGa_uwIvrkuvZLbvGs';

// Reuse seller_id from existing seed projects
const SELLER_ID = 'b6770792-6cbb-4f79-86d3-9b4ecf53433a';

const PROJECTS = [
  {
    seller_id: SELLER_ID,
    name: 'Hudson River Combined Cycle',
    generation_type: 'Combined Cycle',
    capacity_mw: 750,
    location: 'Bergen County, New Jersey',
    settlement_point: 'PSEG',
    fixed_price_per_mwh: 52.0,
    eac_price_per_mwh: 0,
    price_currency: 'USD',
    annual_escalator_percent: 2.0,
    expected_cod: '2026-09-15',
    guaranteed_cod: '2027-03-15',
    delivery_term_years: 20,
    guaranteed_availability_year1_percent: 92,
    guaranteed_availability_ongoing_percent: 95,
    eac_scheme: null,
    status: 'published',
    metadata: {
      description: '750 MW Natural Gas Combined Cycle plant in PSEG zone, Bergen County, NJ. High-efficiency NGCC suitable for shaped/firm load following.',
      fuel: 'Natural Gas',
      cycle: 'Combined Cycle',
      heat_rate_btu_kwh: 6650,
    },
  },
  {
    seller_id: SELLER_ID,
    name: 'Atlantic Peaking Station',
    generation_type: 'Peaker',
    capacity_mw: 220,
    location: 'Atlantic County, New Jersey',
    settlement_point: 'AECO',
    fixed_price_per_mwh: 88.0,
    eac_price_per_mwh: 0,
    price_currency: 'USD',
    annual_escalator_percent: 2.5,
    expected_cod: '2026-06-30',
    guaranteed_cod: '2026-12-31',
    delivery_term_years: 15,
    guaranteed_availability_year1_percent: 96,
    guaranteed_availability_ongoing_percent: 97,
    eac_scheme: null,
    status: 'published',
    metadata: {
      description: '220 MW simple-cycle natural gas peaking unit in AECO zone, Atlantic County, NJ. Fast-start peaker for shoulder/peak hours.',
      fuel: 'Natural Gas',
      cycle: 'Simple Cycle',
      heat_rate_btu_kwh: 10800,
    },
  },
];

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

let ok = 0, fail = 0;

for (const project of PROJECTS) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/projects`,
    { method: 'POST', headers, body: JSON.stringify(project) }
  );
  const body = await res.text();
  if (res.ok) {
    console.log(`✓  ${project.name} — ${project.generation_type} ${project.capacity_mw} MW @ ${project.settlement_point}`);
    ok++;
  } else {
    console.error(`✗  ${project.name}: ${res.status}\n   ${body}`);
    fail++;
  }
}

console.log(`\n${ok} inserted, ${fail} failed.`);
