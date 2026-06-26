import '../loadEnv.js';
import pg from 'pg';

const { Pool, types } = pg;

// node-pg returns numeric and bigint columns as strings by default. The
// frontend expects JSON numbers (as Supabase/PostgREST returned), and the LMP
// map is keyed by numeric pnode_id, so parse them into numbers here.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8 / bigint

// Postgres connection for the ISO data database (RDS).
//
// Locally, the database is reached through the SSH tunnel defined for the
// `powerdime-ec2` host (LocalForward 5432 -> RDS:5432), so DB_HOST should be
// 127.0.0.1. When the backend runs on the EC2 instance itself, point DB_HOST
// at the RDS endpoint directly (no tunnel needed).
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // RDS rejects unencrypted connections. We don't ship the RDS CA bundle here,
  // so disable cert verification (transport to RDS is still TLS-encrypted; the
  // EC2 hop is already protected by SSH). For production, supply the RDS CA and
  // set rejectUnauthorized: true.
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err);
});

export const query = (text, params) => pool.query(text, params);

export default pool;
