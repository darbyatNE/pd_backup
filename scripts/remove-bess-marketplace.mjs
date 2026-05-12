// Remove the two offsite BESS rows. Battery storage is a BTM/on-site asset
// (already represented in the Capacity tab settlement options) — it's not an
// offsite-PPA product, and certainly not at $35–38/MWh.

const SUPABASE_URL = 'https://hhxkykupjppzmscnveru.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeGt5a3VwanBwem1zY252ZXJ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgwNTkxMSwiZXhwIjoyMDkyMzgxOTExfQ.exzUVTdsiDDJGKnSOnzFCQCzFIGa_uwIvrkuvZLbvGs';

const NAMES = ['Newark BESS', 'Reston BESS'];

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

let ok = 0, fail = 0;
for (const name of NAMES) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/projects?name=eq.${encodeURIComponent(name)}`,
    { method: 'DELETE', headers },
  );
  if (res.ok) {
    console.log(`✓  Deleted: ${name}`);
    ok++;
  } else {
    console.error(`✗  ${name}: ${res.status} ${await res.text()}`);
    fail++;
  }
}
console.log(`\n${ok} removed, ${fail} failed.`);
