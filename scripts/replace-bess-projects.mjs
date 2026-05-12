// Replace the deleted Newark/Reston BESS rows with two appropriate gap-fill
// energy products in the same zones.

const SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeGt5a3VwanBwem1zY252ZXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgwNTkxMSwiZXhwIjoyMDkyMzgxOTExfQ.exzUVTdsiDDJGKnSOnzFCQCzFIGa_uwIvrkuvZLbvGs';
const SELLER_ID = 'b6770792-6cbb-4f79-86d3-9b4ecf53433a';

const PROJECTS = [
  {
    name: 'Hudson Co. Hybrid',
    generation_type: 'Hybrid',
    capacity_mw: 10,
    location: 'Hudson County, New Jersey',
    settlement_point: 'PSEG',
    fixed_price_per_mwh: 55,
    expected_cod: '2026-09-01',
    guaranteed_cod: '2027-03-31',
    delivery_term_years: 12,
    description: '10 MW solar + storage hybrid in PSEG zone, Hudson County, NJ. Daytime + early-evening shape.',
  },
  {
    name: 'Spotsylvania Solar II',
    generation_type: 'Solar',
    capacity_mw: 14,
    location: 'Spotsylvania County, Virginia',
    settlement_point: 'DOM',
    fixed_price_per_mwh: 54,
    expected_cod: '2026-08-15',
    guaranteed_cod: '2027-02-28',
    delivery_term_years: 12,
    description: '14 MW solar in DOM zone, Spotsylvania County, VA. Modular phase II adjacent to the larger Spotsylvania complex.',
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
