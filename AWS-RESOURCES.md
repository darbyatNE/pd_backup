# AWS Resources for Power Dime Portal

The AWS resources required to deploy the Power Dime Portal.

The application has three shippable components:

| Component                    | Runs in                                                |
| ---------------------------- | ------------------------------------------------------ |
| `backend/` (Express API)     | ECS Fargate container, behind an ALB                   |
| `frontend/` (Vite static SPA) | S3 bucket fronted by CloudFront                       |
| `python-services/ml-service/` | **Optional.** Second ECS Fargate service, same ALB     |

Supabase (Postgres + Auth) is a managed external dependency — no AWS resource
is required for it. See `supabase/schema.sql` for the database schema.

All example names use the `powerdime-prod` prefix; substitute a different
environment prefix (e.g. `powerdime-staging`) as needed. All examples use
`us-east-1`; any AWS region works as long as every resource lives in the same
one.

---

## 1. Networking (VPC)

| Resource         | Spec                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------- |
| VPC              | CIDR `10.0.0.0/16`, DNS hostnames + resolution enabled                                      |
| Public subnets   | 2 × across different AZs (e.g. `10.0.1.0/24`, `10.0.2.0/24`). For ALB + NAT.                |
| Private subnets  | 2 × across different AZs (e.g. `10.0.10.0/24`, `10.0.11.0/24`). For ECS tasks.              |
| Internet Gateway | Attached to the VPC                                                                         |
| NAT Gateway      | 1 × in a public subnet. Private subnets route `0.0.0.0/0` through it so tasks can reach ECR |
| Route tables     | Public → IGW. Private → NAT.                                                                |

---

## 2. Security Groups

| SG name                    | Inbound                                             | Outbound        |
| -------------------------- | --------------------------------------------------- | --------------- |
| `powerdime-prod-alb`       | 80 + 443 from `0.0.0.0/0`                           | All to VPC      |
| `powerdime-prod-backend`   | 3000 from `powerdime-prod-alb` SG only              | All to internet |
| `powerdime-prod-ml`        | 8000 from `powerdime-prod-alb` SG only (if deployed) | All to internet |

---

## 3. Application Load Balancer

| Resource       | Spec                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ALB            | Internet-facing, in the public subnets, `powerdime-prod-alb` SG                                                                         |
| HTTPS listener | Port 443 with an ACM certificate (see §9). Default action: forward to `powerdime-prod-backend` target group                             |
| HTTP listener  | Port 80 → redirect to HTTPS 443                                                                                                         |
| Target group   | `powerdime-prod-backend`: target type `ip`, port 3000, protocol HTTP, health check path `/health`, thresholds 2 healthy / 3 unhealthy   |
| Target group   | `powerdime-prod-ml` (only if ML service deployed): port 8000, health check path `/health`. Add a listener rule: path `/ml/*` → this TG. |

---

## 4. ECR (container images)

| Repository                    | Used for                      |
| ----------------------------- | ----------------------------- |
| `powerdime-prod-backend`      | `backend/` Docker image       |
| `powerdime-prod-ml-service`   | `python-services/ml-service/` (optional) |

Enable image scan-on-push on both. Consider a lifecycle policy that expires
untagged images older than 7 days.

---

## 5. ECS (Fargate)

### Cluster

- `powerdime-prod-cluster` (Fargate, no EC2 capacity providers).

### Backend service

| Item                     | Value                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Task family              | `powerdime-prod-backend`                                                                                 |
| Launch type              | Fargate                                                                                                  |
| CPU / memory             | `256` / `512` MiB to start — scale to `512` / `1024` once there's real traffic                           |
| Execution role           | See §7 (`powerdime-prod-ecs-execution`)                                                                  |
| Task role                | See §7 (`powerdime-prod-backend-task`)                                                                   |
| Container image          | `${ECR_BACKEND}:latest` built from `backend/Dockerfile`                                                  |
| Container port           | `3000`                                                                                                   |
| Environment variables    | `PORT=3000`, `NODE_ENV=production`, `AWS_REGION=us-east-1`, `AWS_S3_BUCKET_NAME=powerdime-prod-uploads-742428948650`  |
| Secrets (from Secrets Manager) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (see §8)                |
| Log configuration        | `awslogs` driver → `/ecs/powerdime-prod-backend` CloudWatch log group                                    |
| Service desired count    | `2` (rolling update with min 100% / max 200%)                                                            |
| Subnets                  | The two private subnets                                                                                  |
| Security group           | `powerdime-prod-backend`                                                                                 |
| Assign public IP         | Disabled (private subnets + NAT)                                                                         |
| Load balancer            | Register with `powerdime-prod-backend` target group, container `backend` port `3000`                     |

### ML service (optional)

Same shape as the backend service, but:

- Task family `powerdime-prod-ml-service`, port `8000`, image built from
  `python-services/ml-service/Dockerfile`.
- Register with the `powerdime-prod-ml` target group.
- No Supabase secrets needed for the stub implementation. Add them when the
  service grows a database dependency.

---

## 6. S3 + CloudFront (frontend + uploads)

### Uploads bucket

| Item             | Value                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Name             | `powerdime-prod-uploads-742428948650` (account-ID suffix; account `742428948650`)                |
| Public access    | Block all public access                                                                           |
| Versioning       | Enabled (lets operators recover from accidental overwrites)                                       |
| Default encryption | SSE-S3 (AES256) or SSE-KMS with a CMK if customer-managed keys are required                     |
| CORS             | Allow the CloudFront domain + `http://localhost:5173` for local dev on `GET`, `PUT`, `POST`, `HEAD` |

The backend reads/writes this bucket using its task role (§7). End users never
hit S3 directly — they go through presigned URLs the backend mints.

### Frontend bucket

| Item             | Value                                                 |
| ---------------- | ----------------------------------------------------- |
| Name             | `powerdime-prod-frontend`                             |
| Public access    | Block all public access (CloudFront reads via OAC)    |
| Versioning       | Enabled                                               |

### CloudFront distribution

| Item                    | Value                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin                  | `powerdime-prod-frontend` S3 bucket via Origin Access Control (grant OAC `s3:GetObject` on the bucket)                                          |
| Default root object     | `index.html`                                                                                                                                    |
| Default behavior        | Viewer protocol policy: Redirect HTTP to HTTPS. Allowed methods: `GET`, `HEAD`. Cache policy: `Managed-CachingOptimized`                        |
| SPA fallback            | Custom error responses: 403 → `/index.html` (200), 404 → `/index.html` (200). React Router depends on this.                                     |
| Alternate domain (CNAME) | e.g. `app.powerdime.com` with an ACM certificate in `us-east-1` (CloudFront only accepts certs from `us-east-1`)                               |

The backend ALB can either run on its own DNS name (`api.powerdime.com`) or be
routed through CloudFront as a second origin with path pattern `/api/*`. The
current app reads `import.meta.env.VITE_API_URL` at build time, so either
arrangement works — pick one and bake it into the Vite build.

---

## 7. IAM

### `powerdime-prod-ecs-execution` (task execution role)

Trust: `ecs-tasks.amazonaws.com`.
Managed policy: `AmazonECSTaskExecutionRolePolicy`.
Inline policy — read the Supabase secret:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:powerdime-prod-supabase-*"
  }]
}
```

### `powerdime-prod-backend-task` (task role for the backend container)

Trust: `ecs-tasks.amazonaws.com`.
Inline policy — S3 + CloudWatch Logs for client error reporter:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::powerdime-prod-uploads-742428948650",
        "arn:aws:s3:::powerdime-prod-uploads-742428948650/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:us-east-1:ACCOUNT_ID:log-group:/client/powerdime-frontend-errors:*"
    }
  ]
}
```

### Deploy role

The role the CI/CD workflow assumes at deploy time is defined separately in
§12.

---

## 8. Secrets Manager

Create one secret per environment holding the Supabase credentials the backend
reads at boot:

**Name:** `powerdime-prod-supabase-credentials`

**Value (JSON):**

```json
{
  "VITE_SUPABASE_URL": "https://YOUR_PROJECT_REF.supabase.co",
  "VITE_SUPABASE_ANON_KEY": "eyJ...",
  "SUPABASE_SERVICE_ROLE_KEY": "eyJ..."
}
```

Reference these keys from the ECS task definition `secrets` block so the values
are injected as env vars at container start — never hard-code them into an
image or `.env` file.

---

## 9. TLS certificates (ACM)

Two certificates are required — one for the ALB, one for CloudFront:

| Certificate                         | Region             | Used by                                                                 |
| ----------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| `api.powerdime.com` (or equivalent) | Service region (e.g. `us-east-1`) | ALB HTTPS listener                                       |
| `app.powerdime.com`                 | **`us-east-1`**    | CloudFront distribution (CloudFront only accepts certs from us-east-1) |

Validate via DNS (CNAME records in Route 53 or an external DNS provider).

---

## 10. CloudWatch

| Log group                                 | Retention | Producer                                |
| ----------------------------------------- | --------- | --------------------------------------- |
| `/ecs/powerdime-prod-backend`             | 30 days   | Backend container stdout/stderr         |
| `/ecs/powerdime-prod-ml-service`          | 30 days   | ML container (if deployed)              |
| `/client/powerdime-frontend-errors`       | 30 days   | `backend/src/middleware/clientErrorLogger.js` ships frontend errors here in production |

Optional alarms worth setting up on day one:

- ALB `HTTPCode_Target_5XX_Count` > 5 per 5 minutes
- ECS `CPUUtilization` > 80% sustained for 10 minutes
- ECS `MemoryUtilization` > 85% sustained for 10 minutes

Wire the alarms to an SNS topic subscribed to an on-call email or Slack channel.

---

## 11. DNS (Route 53 or external)

| Record                  | Type   | Target                                   |
| ----------------------- | ------ | ---------------------------------------- |
| `app.powerdime.com`     | A alias | CloudFront distribution domain           |
| `api.powerdime.com`     | A alias | ALB DNS name                             |

---

## 12. CI/CD — GitHub Actions via OIDC

Deployment is driven by `.github/workflows/deploy.yml`. On every push to `main`
it runs two parallel jobs:

- **Backend** — build a Docker image from `backend/Dockerfile`, push it to ECR
  tagged with the commit SHA and `latest`, then force a new ECS deployment.
- **Frontend** — run `npm run build` in `frontend/` with the Supabase + API
  URL variables baked in, sync the result to the S3 bucket, and invalidate the
  CloudFront distribution.

Authentication is done with GitHub's OIDC provider — no long-lived AWS access
keys live in GitHub. The workflow assumes an IAM role; GitHub exchanges its
OIDC token for short-lived AWS credentials at job start.

### 12.1 Create the GitHub OIDC provider in IAM (once per AWS account)

```
Provider URL:  https://token.actions.githubusercontent.com
Audience:      sts.amazonaws.com
```

AWS uses its hardcoded thumbprint for this provider, so no thumbprint is
required when creating it through the console or modern CLI.

### 12.2 Create the deploy role

**Name:** `powerdime-prod-deploy`

**Trust policy** — restrict which GitHub repo + branch can assume this role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:ref:refs/heads/main"
      }
    }
  }]
}
```

Replace `ACCOUNT_ID` with the AWS account ID and `ORG/REPO` with the GitHub
repository slug (e.g. `powerdime-dev/powerdime`). Widen the `sub` condition
to `repo:ORG/REPO:*` if preview deploys from branches are desired.

**Permission policy** — the minimum needed by the workflow:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeImages",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:us-east-1:ACCOUNT_ID:repository/powerdime-prod-*"
    },
    {
      "Sid": "EcsDeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:UpdateService"
      ],
      "Resource": "arn:aws:ecs:us-east-1:ACCOUNT_ID:service/powerdime-prod-cluster/*"
    },
    {
      "Sid": "IamPassTaskRoles",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::ACCOUNT_ID:role/powerdime-prod-ecs-execution",
        "arn:aws:iam::ACCOUNT_ID:role/powerdime-prod-backend-task"
      ]
    },
    {
      "Sid": "S3FrontendSync",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::powerdime-prod-frontend",
        "arn:aws:s3:::powerdime-prod-frontend/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidate",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::ACCOUNT_ID:distribution/CLOUDFRONT_DIST_ID"
    }
  ]
}
```

### 12.3 Configure the GitHub repository

In the repository **Settings → Secrets and variables → Actions**, add:

**Secrets** (sensitive values):

| Name                     | Value                                                        |
| ------------------------ | ------------------------------------------------------------ |
| `AWS_DEPLOY_ROLE_ARN`    | `arn:aws:iam::ACCOUNT_ID:role/powerdime-prod-deploy`          |
| `VITE_SUPABASE_URL`      | Supabase project URL                                          |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (baked into the frontend bundle)            |

**Variables** (non-sensitive):

| Name                     | Example value                                                       |
| ------------------------ | ------------------------------------------------------------------- |
| `AWS_REGION`             | `us-east-1`                                                          |
| `ECR_BACKEND_REPO`       | `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/powerdime-prod-backend`  |
| `ECS_CLUSTER`            | `powerdime-prod-cluster`                                             |
| `ECS_BACKEND_SERVICE`    | `powerdime-prod-backend`                                             |
| `FRONTEND_BUCKET`        | `powerdime-prod-frontend`                                            |
| `CLOUDFRONT_DIST_ID`     | `EXXXXXXXXXXXXX`                                                     |
| `VITE_API_URL`           | `https://api.powerdime.com` (or whatever the backend hostname is)   |

Pushing to `main` after these are set triggers a full deploy. A manual run is
available from the **Actions** tab via *Run workflow* on the `Deploy` workflow.

### 12.4 Deploying the ML service (optional)

The workflow does not deploy `python-services/ml-service/` by default because
it's not wired into the frontend yet. To enable it, extend
`.github/workflows/deploy.yml` with a third job mirroring `backend:` but using
`python-services/ml-service/Dockerfile` and the `powerdime-prod-ml-service`
ECS service. Add the matching ECR + ECS entries to the deploy role's
permission policy and a new set of GitHub variables
(`ECR_ML_REPO`, `ECS_ML_SERVICE`).

---

## Quick start checklist

- [ ] VPC + subnets + NAT (§1)
- [ ] Security groups (§2)
- [ ] ACM certs in both the service region and `us-east-1` (§9)
- [ ] S3 buckets (§6), CloudFront distribution pointing at the frontend bucket
- [ ] ECR repositories (§4)
- [ ] Secrets Manager entry with Supabase creds (§8)
- [ ] IAM task + execution roles (§7)
- [ ] ECS cluster + ALB + target groups (§3, §5)
- [ ] ECS service for backend (§5)
- [ ] Log groups + alarms (§10)
- [ ] DNS records (§11)
- [ ] GitHub OIDC provider + deploy role (§12.1–§12.2)
- [ ] GitHub repository secrets + variables (§12.3)
- [ ] First deploy (§12)
- [ ] Run `supabase/schema.sql` against the Supabase project
