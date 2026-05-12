// Updates all seed projects to PJM-footprint locations with correct settlement zones.
// Run: node scripts/update-projects-pjm.mjs

const SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeGt5a3VwanBwem1zY252ZXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgwNTkxMSwiZXhwIjoyMDkyMzgxOTExfQ.exzUVTdsiDDJGKnSOnzFCQCzFIGa_uwIvrkuvZLbvGs';

const UPDATES = [
  {
    id: 'a35394b8-3d5e-4a10-8b18-d43c90e46390',
    name: 'Potomac Solar Resources',
    location: 'Spotsylvania County, Virginia',
    settlement_point: 'DOM',
    metadata: { description: '50 MW Solar PV project in the Dominion Virginia Power zone, Spotsylvania County, VA.' },
  },
  {
    id: 'cd6033fd-b96f-4bc7-bbaf-e3f4326167a3',
    name: 'Blue Mountain Solar',
    location: 'Frederick County, Maryland',
    settlement_point: 'BGE',
    metadata: { description: '100 MW Solar PV project in the BGE zone, Frederick County, MD.' },
  },
  {
    id: '38ac7a27-70db-4a4f-81b1-41e1902c775e',
    name: 'Blue Ridge Solar Farm',
    location: 'Clarke County, Virginia',
    settlement_point: 'DOM',
    metadata: { description: '100 MW Solar PV project in the DOM zone, Clarke County, VA — Shenandoah Valley corridor.' },
  },
  {
    id: '92c9bddd-eb87-43a4-ab6d-8ee0c364b423',
    name: 'Susquehanna Valley Solar',
    location: 'Lancaster County, Pennsylvania',
    settlement_point: 'PPL',
    metadata: { description: '150 MW utility-scale solar in the PPL zone, Lancaster County, PA.' },
  },
  {
    id: '5b7cc7d7-c124-4012-8889-c0f7c538ca59',
    name: 'Muskingum Valley Solar',
    location: 'Muskingum County, Ohio',
    settlement_point: 'AEP',
    metadata: { description: '200 MW Solar PV project in the AEP zone, Muskingum County, OH.' },
  },
  {
    id: '1bd45c99-b236-465f-92d1-2a7843fdce2d',
    name: 'Chester Solar Farm',
    location: 'Chester County, Pennsylvania',
    settlement_point: 'PECO',
    metadata: { description: '75 MW Solar PV project in the PECO zone, Chester County, PA.' },
  },
  {
    id: '4068147e-1b04-4792-8ca1-49ff98f96454',
    name: 'Southern Maryland Solar',
    location: 'Prince George\'s County, Maryland',
    settlement_point: 'PEPCO',
    metadata: { description: '120 MW Solar PV project in the PEPCO zone, Prince George\'s County, MD.' },
  },
  {
    id: '1938e655-711b-4d60-9e6c-88d7323e096b',
    name: 'Rappahannock Solar Farm',
    location: 'Fauquier County, Virginia',
    settlement_point: 'DOM',
    metadata: { description: '180 MW utility-scale solar in the DOM zone, Fauquier County, VA.' },
  },
  {
    id: 'ea676900-1e4e-4cb7-8569-132ea3684b0d',
    name: 'Allegheny Highlands Wind',
    location: 'Grant County, West Virginia',
    settlement_point: 'APS',
    metadata: { description: '250 MW wind project in the APS zone, Grant County, WV — Allegheny Mountains ridge.' },
  },
  {
    id: '48457a4a-5bc8-49a4-9e51-739c89bd8651',
    name: 'Atlantic Shores Offshore Wind',
    location: 'Offshore New Jersey',
    settlement_point: 'JCPL',
    metadata: { description: '300 MW offshore wind project in the JCPL zone, NJ outer continental shelf.' },
  },
  {
    id: '80bc9beb-eaf2-4aaf-bda9-d054e43e6c2e',
    name: 'Backbone Mountain Wind',
    location: 'Tucker County, West Virginia',
    settlement_point: 'APS',
    metadata: { description: '175 MW wind project in the APS zone, Tucker County, WV — Backbone Mountain ridgeline.' },
  },
  {
    id: '933b6170-790d-4d18-8dfb-cf6ef1cd30c3',
    name: 'Prairie State Wind Farm',
    location: 'Lee County, Illinois',
    settlement_point: 'COMED',
    metadata: { description: '220 MW wind project in the COMED zone, Lee County, IL — northern Illinois wind corridor.' },
  },
  {
    id: 'e90b5342-32b8-4890-a0e0-988302750155',
    name: 'Atlantic Wind Farm',
    location: 'Atlantic County, New Jersey',
    settlement_point: 'AECO',
    metadata: { description: '190 MW wind project in the AECO zone, Atlantic County, NJ.' },
  },
  {
    id: '34fd995b-9650-4618-9b2d-c36dc5cb2e74',
    name: 'Berks County Solar Farm',
    location: 'Berks County, Pennsylvania',
    settlement_point: 'METED',
    metadata: { description: '50 MW Solar PV project in the METED zone, Berks County, PA.' },
  },
  {
    id: '466d01ba-fcdd-46f9-9e0b-31e62c2b523d',
    name: 'Eastern Shore Solar',
    location: 'Accomack County, Virginia',
    settlement_point: 'DOM',
    metadata: { description: '200 MW Solar PV project in the DOM zone, Accomack County, VA — Eastern Shore.' },
  },
  {
    id: '8b9b4ea0-9a67-49b1-a34d-3a7ccccf0942',
    name: 'Musconetcong Ridge Wind',
    location: 'Warren County, New Jersey',
    settlement_point: 'PSEG',
    metadata: { description: '80 MW wind project in the PSEG zone, Warren County, NJ — Musconetcong ridgeline.' },
  },
];

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

let ok = 0, fail = 0;

for (const { id, ...fields } of UPDATES) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/projects?id=eq.${id}`,
    { method: 'PATCH', headers, body: JSON.stringify(fields) }
  );
  if (res.ok) {
    console.log(`✓  ${fields.name} → ${fields.settlement_point} (${fields.location})`);
    ok++;
  } else {
    const txt = await res.text();
    console.error(`✗  ${id}: ${res.status} ${txt}`);
    fail++;
  }
}

console.log(`\n${ok} updated, ${fail} failed.`);
