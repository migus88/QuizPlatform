#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Load environment
# ---------------------------------------------------------------------------

if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

info()  { echo -e "\033[36m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[31m[ERROR]\033[0m $*"; }
fatal() { error "$@"; exit 1; }

confirm() {
    local msg="${1:-Continue?}"
    read -rp "$(echo -e "\033[33m$msg [y/N]\033[0m ") " answer
    [[ "$answer" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }
}

# ---------------------------------------------------------------------------
# Configuration (from .env)
# ---------------------------------------------------------------------------

require_var() {
    local var_name="$1"
    if [[ -z "${!var_name:-}" ]]; then
        fatal "$var_name is not set. Add it to .env at the repo root."
    fi
}

require_deploy_vars() {
    require_var DEPLOY_LIGHTSAIL_INSTANCE
    require_var DEPLOY_LIGHTSAIL_REGION
    require_var DEPLOY_LIGHTSAIL_SNAPSHOT
    require_var DEPLOY_LIGHTSAIL_STATIC_IP
    require_var DEPLOY_SSH_USER
    require_var DEPLOY_SSH_KEY
    require_var DEPLOY_API_URL
}

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------

check_prerequisites() {
    local missing=()
    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v aws  >/dev/null 2>&1 || missing+=("aws (AWS CLI)")
    command -v ssh  >/dev/null 2>&1 || missing+=("ssh")
    command -v jq   >/dev/null 2>&1 || missing+=("jq")

    if [[ ${#missing[@]} -gt 0 ]]; then
        fatal "Missing prerequisites: ${missing[*]}"
    fi

    local key_path="${DEPLOY_SSH_KEY/#\~/$HOME}"
    [[ -f "$key_path" ]] || fatal "SSH key not found: $DEPLOY_SSH_KEY"

    aws sts get-caller-identity --region "$DEPLOY_LIGHTSAIL_REGION" >/dev/null 2>&1 \
        || fatal "AWS credentials not configured. Run 'aws configure' first."

    ok "Prerequisites satisfied."
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

resolve_ip() {
    aws lightsail get-static-ip \
        --static-ip-name "$DEPLOY_LIGHTSAIL_STATIC_IP" \
        --region "$DEPLOY_LIGHTSAIL_REGION" \
        --query 'staticIp.ipAddress' --output text 2>/dev/null \
        || fatal "Could not resolve static IP '$DEPLOY_LIGHTSAIL_STATIC_IP'"
}

run_ssh() {
    local ip="$1"
    shift
    ssh -i "${DEPLOY_SSH_KEY/#\~/$HOME}" $SSH_OPTS "${DEPLOY_SSH_USER}@${ip}" "$@"
}

# ---------------------------------------------------------------------------
# snapshot — Create a Lightsail VM snapshot (keeps only one)
# ---------------------------------------------------------------------------

cmd_snapshot() {
    info "=== Creating Lightsail Snapshot ==="
    require_deploy_vars
    check_prerequisites

    local instance="$DEPLOY_LIGHTSAIL_INSTANCE"
    local prefix="$DEPLOY_LIGHTSAIL_SNAPSHOT"
    local region="$DEPLOY_LIGHTSAIL_REGION"
    local new_snapshot="${prefix}-$(date +%Y%m%d%H%M%S)"

    aws lightsail get-instance --instance-name "$instance" --region "$region" >/dev/null 2>&1 \
        || fatal "Instance '$instance' not found in region '$region'"

    info "Creating snapshot '$new_snapshot' from instance '$instance'..."
    aws lightsail create-instance-snapshot \
        --instance-name "$instance" \
        --instance-snapshot-name "$new_snapshot" \
        --region "$region"

    info "Waiting for snapshot to become available..."
    local attempts=0
    while true; do
        local state
        state=$(aws lightsail get-instance-snapshot \
            --instance-snapshot-name "$new_snapshot" \
            --region "$region" \
            --query 'instanceSnapshot.state' --output text 2>/dev/null || echo "pending")
        [[ "$state" == "available" ]] && break
        attempts=$((attempts + 1))
        [[ $attempts -gt 60 ]] && fatal "Snapshot creation timed out after 10 minutes"
        printf "."
        sleep 10
    done
    echo ""
    ok "Snapshot '$new_snapshot' is available."

    # Delete old snapshots (keep only the new one)
    info "Cleaning up old snapshots..."
    aws lightsail get-instance-snapshots --region "$region" \
        --query "instanceSnapshots[?starts_with(name, '${prefix}-')].name" --output text \
    | tr '\t' '\n' \
    | while read -r old; do
        [[ "$old" == "$new_snapshot" ]] && continue
        [[ -z "$old" ]] && continue
        info "  Deleting old snapshot: $old"
        aws lightsail delete-instance-snapshot \
            --instance-snapshot-name "$old" --region "$region" 2>/dev/null || true
    done

    ok "Snapshot complete: $new_snapshot"
}

# ---------------------------------------------------------------------------
# deploy — Deploy to Lightsail VM
# ---------------------------------------------------------------------------

cmd_deploy() {
    info "=== Deploying to Lightsail VM ==="
    require_deploy_vars
    check_prerequisites

    confirm "Deploy to ${DEPLOY_LIGHTSAIL_INSTANCE}?"

    local ip
    ip=$(resolve_ip)
    info "SSH target: ${DEPLOY_SSH_USER}@${ip}"

    info "Testing SSH connection..."
    run_ssh "$ip" "echo ok" >/dev/null 2>&1 \
        || fatal "Cannot SSH to ${DEPLOY_SSH_USER}@${ip}. Check DEPLOY_SSH_KEY and security group."
    ok "SSH connection successful."

    info "Pulling latest code on remote..."
    run_ssh "$ip" "cd ~/quizplatform && git pull origin main"

    info "Rebuilding and restarting Docker containers..."
    run_ssh "$ip" "cd ~/quizplatform && docker compose -f docker/docker-compose.prod.yml up -d --build"

    info "Waiting for services to start..."
    sleep 10

    cmd_verify
    ok "Deployment complete."
}

# ---------------------------------------------------------------------------
# verify — Check that the production API is healthy
# ---------------------------------------------------------------------------

cmd_verify() {
    info "Verifying production API health..."
    require_var DEPLOY_API_URL

    local url="${DEPLOY_API_URL}/health"
    local attempts=0
    local max_attempts=12

    while true; do
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")

        if [[ "$http_code" == "200" ]]; then
            ok "API is healthy."
            return 0
        fi

        attempts=$((attempts + 1))
        if [[ $attempts -ge $max_attempts ]]; then
            error "Health check failed after $((max_attempts * 10)) seconds (last HTTP status: $http_code)"
            return 1
        fi

        warn "Health check attempt $attempts/$max_attempts (HTTP $http_code), retrying in 10s..."
        sleep 10
    done
}

# ---------------------------------------------------------------------------
# rollback — Restore from the last snapshot
# ---------------------------------------------------------------------------

cmd_rollback() {
    info "=== Rolling Back to Last Snapshot ==="
    require_deploy_vars
    check_prerequisites

    local region="$DEPLOY_LIGHTSAIL_REGION"
    local prefix="$DEPLOY_LIGHTSAIL_SNAPSHOT"
    local static_ip="$DEPLOY_LIGHTSAIL_STATIC_IP"
    local old_instance="$DEPLOY_LIGHTSAIL_INSTANCE"
    local bundle="${DEPLOY_LIGHTSAIL_BUNDLE:-micro_3_0}"

    local snapshot
    snapshot=$(aws lightsail get-instance-snapshots --region "$region" \
        --query "sort_by(instanceSnapshots[?starts_with(name, '${prefix}-')], &createdAt)[-1].name" \
        --output text 2>/dev/null)

    [[ -z "$snapshot" || "$snapshot" == "None" ]] && fatal "No snapshot found with prefix '$prefix'"
    info "Using snapshot: $snapshot"

    local az
    az=$(aws lightsail get-instance --instance-name "$old_instance" --region "$region" \
        --query 'instance.location.availabilityZone' --output text 2>/dev/null) \
        || fatal "Could not determine availability zone"

    local new_instance="${old_instance}-$(date +%Y%m%d%H%M%S)"

    confirm "Create instance '$new_instance' from snapshot '$snapshot' and move static IP?"

    info "Creating instance '$new_instance' from snapshot..."
    aws lightsail create-instances-from-snapshot \
        --instance-names "$new_instance" \
        --availability-zone "$az" \
        --bundle-id "$bundle" \
        --instance-snapshot-name "$snapshot" \
        --region "$region"

    info "Waiting for new instance to start..."
    local attempts=0
    while true; do
        local state
        state=$(aws lightsail get-instance \
            --instance-name "$new_instance" \
            --region "$region" \
            --query 'instance.state.name' --output text 2>/dev/null || echo "pending")
        [[ "$state" == "running" ]] && break
        attempts=$((attempts + 1))
        [[ $attempts -gt 60 ]] && fatal "Instance creation timed out"
        printf "."
        sleep 10
    done
    echo ""
    ok "Instance '$new_instance' is running."

    info "Moving static IP..."
    aws lightsail detach-static-ip --static-ip-name "$static_ip" --region "$region" 2>/dev/null || true
    aws lightsail attach-static-ip --static-ip-name "$static_ip" --instance-name "$new_instance" --region "$region"
    ok "Static IP reassigned to '$new_instance'."

    sleep 15
    cmd_verify || warn "Health check failed. Check the instance manually."

    echo ""
    warn "Old instance '$old_instance' is still running. Delete it after confirming rollback:"
    echo "  aws lightsail delete-instance --instance-name $old_instance --region $region"
    warn "Update DEPLOY_LIGHTSAIL_INSTANCE in .env to: $new_instance"
}

# ---------------------------------------------------------------------------
# full — Complete deployment: snapshot -> deploy -> verify
# ---------------------------------------------------------------------------

cmd_full() {
    info "=== Full Deployment ==="
    require_deploy_vars
    confirm "Run full deployment (snapshot -> deploy -> verify)?"
    cmd_snapshot
    echo ""
    cmd_deploy
    echo ""
    ok "=== Full deployment complete ==="
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

usage() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  snapshot     Create a pre-deployment Lightsail VM snapshot"
    echo "  deploy       Deploy to Lightsail VM (SSH + Docker rebuild)"
    echo "  verify       Check production API health"
    echo "  rollback     Restore from last snapshot (new instance + IP swap)"
    echo "  full         Full deploy: snapshot -> deploy -> verify"
}

main() {
    local cmd="${1:-}"
    case "$cmd" in
        snapshot)  cmd_snapshot ;;
        deploy)    cmd_deploy ;;
        verify)    cmd_verify ;;
        rollback)  cmd_rollback ;;
        full)      cmd_full ;;
        -h|--help) usage ;;
        *)         usage; exit 1 ;;
    esac
}

main "$@"
