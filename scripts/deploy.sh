#!/usr/bin/env bash
# Deploy this site to the shared VM.
#
# Required env vars (set in .env at the repo root):
#   DEPLOY_SSH_USER       SSH user on the shared VM (e.g. ubuntu)
#   DEPLOY_SSH_HOST       Static IP or hostname of the shared VM
#   DEPLOY_SSH_KEY        Path to SSH private key (e.g. ~/.ssh/quizplatform.pem)
#   DEPLOY_REMOTE_DIR     Absolute path to this site's checkout on the VM (e.g. /home/ubuntu/sites/quizplatform)
#   DEPLOY_SITE_NAME      Site identifier; matches deploy/caddy/<name>.caddy (e.g. quizplatform)
#   DEPLOY_API_URL        Public base URL used for the post-deploy health check
#
# Optional:
#   DEPLOY_HEALTH_PATH    Health endpoint path (default: /api/health; set to /health for QuizPlatform)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi

info()  { echo -e "\033[36m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[31m[ERROR]\033[0m $*" >&2; }
fatal() { error "$@"; exit 1; }

require() { [[ -n "${!1:-}" ]] || fatal "$1 is not set in .env"; }
require DEPLOY_SSH_USER
require DEPLOY_SSH_HOST
require DEPLOY_SSH_KEY
require DEPLOY_REMOTE_DIR
require DEPLOY_SITE_NAME
require DEPLOY_API_URL

HEALTH_PATH="${DEPLOY_HEALTH_PATH:-/api/health}"
KEY_PATH="${DEPLOY_SSH_KEY/#\~/$HOME}"
[[ -f "$KEY_PATH" ]] || fatal "SSH key not found: $DEPLOY_SSH_KEY"

SSH_OPTS=(-i "$KEY_PATH" -o StrictHostKeyChecking=no -o ConnectTimeout=10)
TARGET="${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}"
ssh_run() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

info "Target: $TARGET"
ssh_run "echo ok" >/dev/null 2>&1 || fatal "Cannot SSH to $TARGET. Check DEPLOY_SSH_KEY / DEPLOY_SSH_HOST."
ok   "SSH ok."

info "Pulling latest code on remote..."
ssh_run "cd '$DEPLOY_REMOTE_DIR' && git pull origin main"

info "Publishing Caddy fragment..."
ssh_run "cp '$DEPLOY_REMOTE_DIR/deploy/caddy/$DEPLOY_SITE_NAME.caddy' /srv/shared/caddy/sites.d/"

info "Rebuilding and restarting site stack..."
ssh_run "cd '$DEPLOY_REMOTE_DIR' && docker compose -f docker/docker-compose.prod.yml --env-file .env up -d --build --remove-orphans"

info "Reloading shared Caddy..."
ssh_run "docker exec shared-caddy caddy reload --config /etc/caddy/Caddyfile"

info "Verifying ${DEPLOY_API_URL}${HEALTH_PATH}..."
sleep 5
for i in $(seq 1 12); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${DEPLOY_API_URL}${HEALTH_PATH}" 2>/dev/null || echo 000)
    if [[ "$code" == "200" ]]; then
        ok "Healthy."
        exit 0
    fi
    warn "  attempt $i/12 (HTTP $code), retrying in 10s..."
    sleep 10
done
fatal "Health check failed after 120s. URL: ${DEPLOY_API_URL}${HEALTH_PATH}"
