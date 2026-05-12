// Move the three Ohio buyer load sites into the DOM (Dominion Virginia Power) zone:
//   Dayton DC      -> Ashburn DC          (Loudoun County, VA)
//   Lima Industrial-> Manassas Industrial (Prince William County, VA)
//   Findlay Hyper. -> Sterling Hyperscale (Loudoun County, VA)

const SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeGt5a3VwanBwem1zY252ZXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgwNTkxMSwiZXhwIjoyMDkyMzgxOTExfQ.exzUVTdsiDDJGKnSOnzFCQCzFIGa_uwIvrkuvZLbvGs';

const UPDATES = [
  {
    id: '87ae65a7-4629-4933-bc29-0389b6cfff82',
    name: 'Ashburn Data Center',
    location: 'Ashburn, Virginia',
    settlement_zone: 'PJM DOM',
  },
  {
    id: '1c184713-7ff0-43e8-9bee-34aff33205e2',
    name: 'Manassas Industrial Campus',
    location: 'Manassas, Virginia',
    settlement_zone: 'PJM DOM',
  },
  {
    id: '5808444f-1e64-4a15-8ed0-fc003abee8ac',
    name: 'Sterling Hyperscale Hub',
    location: 'Sterling, Virginia',
    settlement_zone: 'PJM DOM',
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
    `${SUPABASE_URL}/rest/v1/buyer_projects?id=eq.${id}`,
    { method: 'PATCH', headers, body: JSON.stringify(fields) }
  );
  if (res.ok) {
    console.log(`✓  ${fields.name} → ${fields.settlement_zone} (${fields.location})`);
    ok++;
  } else {
    console.error(`✗  ${id}: ${res.status} ${await res.text()}`);
    fail++;
  }
}
console.log(`\n${ok} updated, ${fail} failed.`);
