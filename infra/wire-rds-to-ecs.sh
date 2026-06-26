#!/usr/bin/env bash
#
# wire-rds-to-ecs.sh — give the production ECS backend a direct, credentialed
# path to the RDS Postgres database that powers the chart/map endpoints.
#
# The backend code (backend/src/services/db.js) is already env-driven: it reads
# DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD and connects straight to RDS with
# no SSH tunnel. This wires those values into the ECS service the same way the
# Supabase secrets are wired (Secrets Manager -> task secrets block).
#
# Two intended ways to run it:
#
#   ONE-TIME SETUP (needs the DB password + IAM rights; run by an admin once):
#     ./infra/wire-rds-to-ecs.sh --setup --apply
#       -> creates the Secrets Manager secret from .env, grants the ECS
#          execution role GetSecretValue, opens RDS:5432 from the backend SG.
#          Does NOT register a task def or roll the service.
#
#   EVERY DEPLOY (keyless OIDC role; run by CI — see .github/workflows/deploy.yml):
#     SKIP_SECRET=1 SKIP_IAM=1 IMAGE=<repo>:<sha> ./infra/wire-rds-to-ecs.sh --apply
#       -> ensures RDS ingress (idempotent), registers a new task-def revision
#          with the DB secrets block + pinned image, rolls the service.
#          Never needs the DB password.
#
# Default is PLAN-ONLY (dry run). Add --apply to make changes.
#
# Flags / env toggles:
#   --apply        actually perform mutations (default: dry run)
#   --setup        only do one-time steps (secret + IAM + SG); skip taskdef/roll
#   SKIP_SECRET=1  do not create/update the Secrets Manager secret value
#   SKIP_IAM=1     do not touch the execution-role policy
#   SKIP_SG=1      do not touch the RDS security-group ingress rule
#   IMAGE=...      pin the backend container image in the new task def revision
#
# Requirements: awscli + jq, and AWS credentials in the shell. (ubuntu-latest
# GitHub runners ship both; the OIDC step provides credentials.)

set -euo pipefail

# ---------------------------------------------------------------------------
# Config — override any of these via environment variables if your names differ.
# ---------------------------------------------------------------------------
REGION="${AWS_REGION:-us-east-1}"
RDS_ENDPOINT="${RDS_ENDPOINT:-iso-data-database.csboma6ou65q.us-east-1.rds.amazonaws.com}"
RDS_IDENTIFIER="${RDS_IDENTIFIER:-${RDS_ENDPOINT%%.*}}"   # first DNS label = db identifier
BACKEND_SG_NAME="${BACKEND_SG_NAME:-powerdime-prod-backend}"
SECRET_NAME="${SECRET_NAME:-powerdime-prod-db-credentials}"
TASK_FAMILY="${TASK_FAMILY:-powerdime-prod-backend}"
CONTAINER_NAME="${CONTAINER_NAME:-backend}"
CLUSTER="${ECS_CLUSTER:-powerdime-prod-cluster}"
SERVICE="${ECS_BACKEND_SERVICE:-}"                         # auto-discovered if empty
EXEC_ROLE="${EXEC_ROLE:-powerdime-prod-ecs-execution}"
EXEC_ROLE_POLICY="${EXEC_ROLE_POLICY:-powerdime-prod-db-secret-read}"
IMAGE="${IMAGE:-}"

SKIP_SECRET="${SKIP_SECRET:-0}"
SKIP_IAM="${SKIP_IAM:-0}"
SKIP_SG="${SKIP_SG:-0}"

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env}"

APPLY=0; SETUP_ONLY=0
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --setup) SETUP_ONLY=1 ;;
    *) echo "unknown arg: $a"; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
run()  { if [[ $APPLY -eq 1 ]]; then "$@"; else printf '   [dry-run] %s\n' "$*"; fi; }

command -v aws >/dev/null || { echo "aws CLI not found"; exit 1; }
command -v jq  >/dev/null || { echo "jq not found";     exit 1; }
aws sts get-caller-identity >/dev/null 2>&1 || { echo "No usable AWS credentials in this shell."; exit 1; }

# ---------------------------------------------------------------------------
# Read DB values: environment variables win, then .env. DB_HOST is forced to the
# RDS endpoint (the .env DB_HOST is the local SSH-tunnel address, 127.0.0.1).
# Only the password/user are actually required, and only when creating the secret.
# ---------------------------------------------------------------------------
envval() { [[ -f "$ENV_FILE" ]] && grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
DB_PORT="${DB_PORT:-$(envval DB_PORT)}";     DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-$(envval DB_NAME)}";     DB_NAME="${DB_NAME:-postgres}"
DB_USER="${DB_USER:-$(envval DB_USER)}"
DB_PASSWORD="${DB_PASSWORD:-$(envval DB_PASSWORD)}"
DB_HOST="$RDS_ENDPOINT"

say "Plan (region=$REGION apply=$APPLY setup_only=$SETUP_ONLY skip_secret=$SKIP_SECRET skip_iam=$SKIP_IAM skip_sg=$SKIP_SG)"
info "RDS         : $DB_HOST:$DB_PORT db=$DB_NAME user=${DB_USER:-<unset>} (password hidden)"
info "Secret      : $SECRET_NAME"
info "ECS         : cluster=$CLUSTER family=$TASK_FAMILY container=$CONTAINER_NAME"
[[ -n "$IMAGE" ]] && info "Image pin   : $IMAGE"

# ---------------------------------------------------------------------------
# 1. Discover security groups (only needed when touching the SG rule)
# ---------------------------------------------------------------------------
if [[ "$SKIP_SG" == "0" ]]; then
  say "1. Discovering security groups"
  RDS_SG_ID="$(aws rds describe-db-instances --db-instance-identifier "$RDS_IDENTIFIER" --region "$REGION" \
    --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)"
  [[ "$RDS_SG_ID" != "None" && -n "$RDS_SG_ID" ]] || { echo "Could not find RDS SG for $RDS_IDENTIFIER"; exit 1; }
  info "RDS SG     : $RDS_SG_ID"
  BACKEND_SG_ID="$(aws ec2 describe-security-groups --region "$REGION" \
    --filters "Name=group-name,Values=$BACKEND_SG_NAME" --query 'SecurityGroups[0].GroupId' --output text)"
  [[ "$BACKEND_SG_ID" != "None" && -n "$BACKEND_SG_ID" ]] || { echo "Could not find backend SG '$BACKEND_SG_NAME'"; exit 1; }
  info "Backend SG : $BACKEND_SG_ID"
fi

# ---------------------------------------------------------------------------
# 2. Create / update the Secrets Manager secret (one-time; skip in CI)
# ---------------------------------------------------------------------------
if [[ "$SKIP_SECRET" == "0" ]]; then
  say "2. Secrets Manager: $SECRET_NAME"
  [[ -n "$DB_USER" && -n "$DB_PASSWORD" ]] || { echo "DB_USER/DB_PASSWORD required to write the secret (set them or provide $ENV_FILE)"; exit 1; }
  SECRET_JSON="$(jq -n --arg h "$DB_HOST" --arg p "$DB_PORT" --arg n "$DB_NAME" --arg u "$DB_USER" --arg pw "$DB_PASSWORD" \
    '{DB_HOST:$h, DB_PORT:$p, DB_NAME:$n, DB_USER:$u, DB_PASSWORD:$pw}')"
  if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
    info "exists -> updating value"
    run aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "$SECRET_JSON" --region "$REGION"
  else
    info "absent -> creating"
    run aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "$SECRET_JSON" --region "$REGION"
  fi
fi

# Resolve the secret ARN for downstream steps.
SECRET_ARN="$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" --query ARN --output text 2>/dev/null || true)"
if [[ -z "$SECRET_ARN" || "$SECRET_ARN" == "None" ]]; then
  if [[ $APPLY -eq 1 && "$SKIP_SECRET" == "1" ]]; then
    echo "Secret '$SECRET_NAME' does not exist. Run the one-time setup first: ./infra/wire-rds-to-ecs.sh --setup --apply"; exit 1
  fi
  ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  SECRET_ARN="arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:${SECRET_NAME}"
  info "ARN (predicted): $SECRET_ARN"
else
  info "Secret ARN  : $SECRET_ARN"
fi

# ---------------------------------------------------------------------------
# 3. Open RDS inbound 5432 from the backend SG (idempotent)
# ---------------------------------------------------------------------------
if [[ "$SKIP_SG" == "0" ]]; then
  say "3. RDS ingress: $RDS_SG_ID <- tcp/$DB_PORT from $BACKEND_SG_ID"
  if aws ec2 describe-security-groups --region "$REGION" --group-ids "$RDS_SG_ID" \
       --query "SecurityGroups[0].IpPermissions[?ToPort==\`${DB_PORT}\`].UserIdGroupPairs[].GroupId" \
       --output text 2>/dev/null | tr '\t' '\n' | grep -qx "$BACKEND_SG_ID"; then
    info "rule already present -> skip"
  else
    run aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$RDS_SG_ID" \
      --ip-permissions "IpProtocol=tcp,FromPort=${DB_PORT},ToPort=${DB_PORT},UserIdGroupPairs=[{GroupId=${BACKEND_SG_ID},Description=powerdime-backend}]"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Let the ECS execution role read the secret (one-time; skip in CI)
# ---------------------------------------------------------------------------
if [[ "$SKIP_IAM" == "0" ]]; then
  say "4. IAM: allow $EXEC_ROLE to GetSecretValue on the secret"
  POLICY_DOC="$(jq -n --arg arn "$SECRET_ARN" '{Version:"2012-10-17",Statement:[{Effect:"Allow",Action:"secretsmanager:GetSecretValue",Resource:($arn+"*")}]}')"
  run aws iam put-role-policy --role-name "$EXEC_ROLE" --policy-name "$EXEC_ROLE_POLICY" --policy-document "$POLICY_DOC"
fi

# ---------------------------------------------------------------------------
# 5 + 6 — register task def with DB secrets block (+ pinned image) and roll.
# Skipped entirely in --setup mode.
# ---------------------------------------------------------------------------
if [[ "$SETUP_ONLY" == "1" ]]; then
  say "Setup-only mode: skipping task-definition register + service roll"
  say "Complete ($([[ $APPLY -eq 1 ]] && echo applied || echo dry-run))"
  [[ $APPLY -eq 0 ]] && echo "Re-run with --apply to execute."
  exit 0
fi

say "5. Task definition: $TASK_FAMILY (+DB secrets on container '$CONTAINER_NAME')"
CUR_TD="$(aws ecs describe-task-definition --task-definition "$TASK_FAMILY" --region "$REGION" --query taskDefinition)"
NEW_TD="$(echo "$CUR_TD" | jq --arg arn "$SECRET_ARN" --arg cname "$CONTAINER_NAME" --arg img "$IMAGE" '
  (["DB_HOST","DB_PORT","DB_NAME","DB_USER","DB_PASSWORD"]) as $keys
  | .containerDefinitions |= map(
      if .name == $cname then
        (if $img != "" then .image = $img else . end)
        | .secrets = (((.secrets // []) | map(select(.name as $n | ($keys | index($n)) | not)))
                      + ($keys | map({name:., valueFrom:($arn + ":" + . + "::")})))
        | .environment = ((.environment // []) | map(select(.name as $n | ($keys | index($n)) | not)))
      else . end)
  | {family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions,
     volumes, placementConstraints, requiresCompatibilities, cpu, memory,
     runtimePlatform, ephemeralStorage, pidMode, ipcMode, proxyConfiguration,
     inferenceAccelerators}
  | with_entries(select(.value != null and .value != []))
')"
TMP_TD="$(mktemp)"; echo "$NEW_TD" > "$TMP_TD"
if [[ $APPLY -eq 1 ]]; then
  NEW_TD_ARN="$(aws ecs register-task-definition --region "$REGION" --cli-input-json "file://$TMP_TD" \
    --query 'taskDefinition.taskDefinitionArn' --output text)"
  info "registered: $NEW_TD_ARN"
else
  info "[dry-run] would register-task-definition from $TMP_TD"
  info "[dry-run] injected container secrets preview:"
  echo "$NEW_TD" | jq -r --arg c "$CONTAINER_NAME" '.containerDefinitions[] | select(.name==$c) | .secrets'
  NEW_TD_ARN="$TASK_FAMILY:NEXT"
fi

say "6. Roll ECS service"
if [[ -z "$SERVICE" ]]; then
  SERVICE="$(aws ecs list-services --cluster "$CLUSTER" --region "$REGION" --query 'serviceArns[]' --output text 2>/dev/null \
    | tr '\t' '\n' | grep -i backend | head -1 | awk -F/ '{print $NF}')"
fi
[[ -n "$SERVICE" ]] || { echo "Could not auto-discover the backend service; set ECS_BACKEND_SERVICE."; exit 1; }
info "service: $SERVICE"
run aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --task-definition "$NEW_TD_ARN" --region "$REGION" --no-cli-pager
if [[ $APPLY -eq 1 ]]; then
  info "waiting for service to stabilize..."
  aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION"
  info "done."
fi

say "Complete ($([[ $APPLY -eq 1 ]] && echo applied || echo dry-run))"
[[ $APPLY -eq 0 ]] && echo "Re-run with --apply to execute."
exit 0
