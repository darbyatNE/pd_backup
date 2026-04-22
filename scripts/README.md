# Scripts

Bootstrap helpers that run against Supabase. The authoritative schema lives in
`supabase/schema.sql`; this folder is for one-off seeding / user-provisioning.

## Files

| File | Purpose |
|---|---|
| `create-users.js` | Creates test users in Supabase Auth via the admin API. Requires `SUPABASE_SERVICE_ROLE_KEY`. |
| `seed-projects-only.sql` | Inserts demo seller projects. Assumes the seller users already exist (run `create-users.js` first). |

## Usage

```bash
# 1. Apply the schema (one time per environment)
# Paste the contents of ../supabase/schema.sql into the Supabase SQL editor
# and run it. Safe to re-run.

# 2. Create test users (requires SUPABASE_SERVICE_ROLE_KEY in .env)
node scripts/create-users.js

# 3. Seed demo projects (optional)
# Paste the contents of scripts/seed-projects-only.sql into the Supabase SQL editor.
```

The `public.users` row for each new user is created automatically by the
`on_auth_user_created` trigger defined in `supabase/schema.sql` — you don't
need to insert into `public.users` yourself.
