# Power Dime Portal

A web-based marketplace connecting renewable energy buyers and sellers through
simplified Power Purchase Agreement (PPA) transactions. Buyers publish
procurement RFPs, sellers list generation projects, and both sides exchange
technical documents and VPPA term sheets.

## Stack

- **Frontend** — Vite + React 19 + TypeScript + Tailwind, deployed as static
  assets to S3 + CloudFront.
- **Backend** — Express 5 on Node 18+, runs as an ECS Fargate container behind
  an ALB. Delegates auth to Supabase and stores user uploads in S3.
- **Database + Auth** — Supabase (managed Postgres with Row Level Security).
- **ML service (optional)** — FastAPI stub in `python-services/ml-service/`
  for future analytics work. Not wired into the frontend yet.

---

## Repository layout

```
.
├── frontend/                 # React + Vite SPA
├── backend/                  # Express API
├── python-services/
│   └── ml-service/           # Optional FastAPI microservice (stub)
├── supabase/
│   └── schema.sql            # Single authoritative DB schema — run in Supabase
├── scripts/                  # Bootstrap scripts (create users, seed projects)
├── docs/                     # Additional documentation
├── AWS-RESOURCES.md          # AWS infrastructure spec for deployment
├── .env.example              # Environment template
└── package.json              # npm workspaces root
```

---

## Local development

### Prerequisites

- Node.js 18+ and npm 9+
- A Supabase project (create one at https://app.supabase.com)
- Optional: Docker (for building container images) and Python 3.11+ (if you
  plan to run the ML service locally)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your Supabase URL + anon key, and an AWS bucket name
# + credentials if you need local S3 uploads to work.
```

### 2. Apply the database schema

Open your Supabase project's SQL editor and run the contents of
`supabase/schema.sql`. It's idempotent — safe to re-run. You can also pipe it
through `psql` or the Supabase CLI if you prefer.

### 3. Seed users (optional)

```bash
node scripts/create-users.js
```

This uses the Supabase admin API to create a handful of demo buyer/seller
accounts. Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

### 4. Install + run

```bash
npm install
npm run dev          # Runs frontend (5173) and backend (3000) together
# Or individually:
npm run frontend
npm run backend
```

The Vite dev server proxies `/api/*` to `http://localhost:3000`, so the
frontend can call the backend without CORS fiddling during development.

### 5. (Optional) Run the Python ML service

```bash
cd python-services/ml-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py           # http://localhost:8000
```

---

## Deployment

See **[`AWS-RESOURCES.md`](./AWS-RESOURCES.md)** for the full list of AWS
resources to provision (VPC, ECS, ALB, S3, CloudFront, Secrets Manager, IAM
roles) and the deploy-loop commands for pushing new code once the infra exists.

The application itself is deployment-agnostic — any platform that can run a
Node container, serve static files over HTTPS, and hold a few secrets will work.

---

## Key configuration

| Variable                         | Consumed by                     | Notes                                                                     |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`              | Frontend build, backend         | Supabase project URL                                                      |
| `VITE_SUPABASE_ANON_KEY`         | Frontend build, backend         | Supabase anon key (safe to ship to browsers — RLS enforces access)        |
| `SUPABASE_SERVICE_ROLE_KEY`      | Scripts, optional backend use   | Supabase service role key — **server-only**, never ship to browsers       |
| `AWS_REGION`                     | Backend (S3 client, error logger) | Defaults to `us-east-1`                                                   |
| `AWS_S3_BUCKET_NAME`             | Backend (uploads)               | Bucket configured per `AWS-RESOURCES.md` §6                                |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Backend (local dev only) | In production the ECS task role handles auth — leave these blank           |
| `FRONTEND_ERROR_LOG_GROUP`       | Backend (client error logger)   | CloudWatch log group name                                                  |
| `VITE_API_URL`                   | Frontend build                  | Only needed for production builds where the API isn't on the same origin   |

---

## Feature overview

- **Authentication** — Supabase Auth with email/password. Roles (`buyer`,
  `seller`, `admin`) are stored in `public.users` and kept in sync with
  `auth.users` via the `on_auth_user_created` trigger.
- **Projects** — Sellers create project listings with full VPPA contract terms
  (fixed/EAC price, COD dates, security, damages, availability, EAC scheme).
- **Buyer projects / RFPs** — Buyers define procurement requirements including
  target capacity, preferred term, settlement zone, and EAC scheme.
- **Transactions** — Buyer submits interest on a project. Seller accepts or
  rejects. RLS ensures each side only sees their own transactions.
- **Documents** — Three buckets: technical documents (project-scoped), power
  plans (buyer consumption/forecast uploads), and transaction documents
  (PPAs, NDAs). All uploads go through presigned S3 URLs minted by the backend.
- **Error reporting** — Frontend errors are shipped to CloudWatch via
  `POST /api/client-errors` in production only.

---

## API endpoints

All under the `/api` prefix. `/health` returns the backend health check.

| Method | Path                                 | Purpose                                                 |
| ------ | ------------------------------------ | ------------------------------------------------------- |
| GET    | `/health`                            | Health check for ALB target group                       |
| POST   | `/api/auth/login`                    | Email/password login                                    |
| POST   | `/api/auth/logout`                   | Sign out                                                |
| GET    | `/api/auth/session`                  | Current session                                         |
| GET    | `/api/projects`                      | List projects (seller view or published feed)           |
| GET    | `/api/projects/:id`                  | Project details                                         |
| POST   | `/api/projects`                      | Create a seller project                                 |
| PUT    | `/api/projects/:id`                  | Update a seller project                                 |
| DELETE | `/api/projects/:id`                  | Delete a seller project                                 |
| GET    | `/api/transactions`                  | Transactions for the current user                       |
| POST   | `/api/transactions`                  | Buyer submits interest                                  |
| PUT    | `/api/transactions/:id/status`       | Seller accepts or rejects                               |
| GET    | `/api/technical-documents`           | Seller project docs                                     |
| POST   | `/api/technical-documents/upload`    | Upload a technical document                             |
| GET    | `/api/power-plans`                   | Buyer consumption uploads                               |
| POST   | `/api/power-plans/upload`            | Upload a power plan                                     |
| GET    | `/api/documents/:id`                 | Download a transaction document                         |
| POST   | `/api/documents/upload`              | Upload a transaction document                           |
| POST   | `/api/client-errors`                 | Receives frontend error reports                         |
