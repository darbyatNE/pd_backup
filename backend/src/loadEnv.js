import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load the repo-root .env regardless of the process working directory, so the
// backend works whether started from the repo root, the backend workspace
// (`npm run backend`), or anywhere else. This file lives at backend/src/, so
// the repo root is two levels up.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, '../../.env') });
