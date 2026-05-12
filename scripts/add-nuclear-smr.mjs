// 300 MW SMR (small modular reactor) coming online ~4 yrs out (mid-2030).
// Sized to a real BWRX-300 unit, sited in PJM's PPL zone next to existing
// nuclear infrastructure — represents the typical post-2030 carbon-free
// baseload product entering the marketplace.

const SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeGt5a3VwanBwem1zY252ZXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgwNTkxMSwiZXhwIjoyMDkyMzgxOTExfQ.exzUVTdsiDDJGKnSOnzFCQCzFIGa_uwIvrkuvZLbvGs';
const SELLER_ID = 'b6770792-6cbb-4f79-86d3-9b4ecf53433a';

const project = {
  seller_id: SELLER_ID,
  name: 'Susquehanna SMR',
  generation_type: 'Nuclear',
  capacity_mw: 300,
  location: 'Luzerne County, Pennsylvania',
  settlement_point: 'PPL',
  fixed_price_per_mwh: 70,
  eac_price_per_mwh: 0,
  price_currency: 'USD',
  annual_escalator_percent: 2.0,
  expected_cod: '2030-05-01',          // ~4 yrs out
  guaranteed_cod: '2030-12-31',
  delivery_term_years: 25,
  guaranteed_availability_year1_percent: 88,   // commissioning year
  guaranteed_availability_ongoing_percent: 92,
  status: 'published',
  metadata: {
    description: '300 MW BWRX-300 small modular reactor co-located at the Susquehanna site in PPL zone, PA. Carbon-free 24/7 baseload.',
    fuel: 'Nuclear (LEU)',
    technology: 'BWRX-300 SMR',
    capacity_factor_pct: 92,
  },
};

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

const res = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
  method: 'POST', headers, body: JSON.stringify(project),
});
if (res.ok) {
  console.log(`✓  ${project.name} — Nuclear ${project.capacity_mw} MW @ ${project.settlement_point} ($${project.fixed_price_per_mwh}/MWh, COD ${project.expected_cod})`);
} else {
  console.error(`✗  ${project.name}: ${res.status} ${await res.text()}`);
}
