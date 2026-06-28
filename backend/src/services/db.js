import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('Missing environment variable: DATABASE_URL');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const query = (sql, params) => pool.query(sql, params);

export const queryOne = async (sql, params) => {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
};

// Helper to serialize objects/arrays for node-postgres (pg)
// pg doesn't auto-stringify objects to JSON, it uses Postgres array syntax {}
const serializeValue = (v, k) => {
  // 'alerts' is a native PostgreSQL ARRAY column (text[]), so we let pg format it.
  // Other arrays/objects are inserted into jsonb columns, so we stringify them.
  if (k === 'alerts') return v;

  if (v !== null && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Buffer)) {
    return JSON.stringify(v);
  }
  return v;
};

// Returns { setClause, values } for a dynamic UPDATE SET, params starting at `startAt`
export const buildUpdateSet = (data, startAt = 1) => {
  const keys = Object.keys(data);
  const setClause = keys.map((k, i) => `"${k}" = $${startAt + i}`).join(', ');
  const values = keys.map(k => serializeValue(data[k], k));
  return { setClause, values };
};

// Returns { cols, placeholders, values } for a dynamic INSERT
export const buildInsert = (data) => {
  const keys = Object.keys(data);
  const cols = keys.map(k => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map(k => serializeValue(data[k], k));
  return { cols, placeholders, values };
};

// Returns { cols, placeholders, updateSet, values } for INSERT ... ON CONFLICT DO UPDATE
export const buildUpsert = (data, conflictCol) => {
  const keys = Object.keys(data);
  const cols = keys.map(k => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const updateSet = keys
    .filter(k => k !== conflictCol)
    .map(k => `"${k}" = EXCLUDED."${k}"`)
    .join(', ');
  const values = keys.map(k => serializeValue(data[k], k));
  return { cols, placeholders, updateSet, values };
};

