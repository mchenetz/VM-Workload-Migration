#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-dev.sh  —  Fast local-iterate / remote-run workflow
#
# Builds the image directly on the remote Docker host (build context sent over
# SSH — no registry push/pull) then restarts the container.
#
# Usage:
#   ./scripts/deploy-dev.sh           # build + deploy to remote
#   ./scripts/deploy-dev.sh --no-open # skip opening browser tunnel
#
# Prerequisites:
#   Docker context "remote" must be configured (run set-remote-host.sh once).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOCKER_CONTEXT="${DOCKER_CONTEXT:-remote}"
IMAGE="vm-migration-estimator:dev"
CONTAINER_NAME="vm-migration-estimator"
PORT=3001
OPEN_TUNNEL=true

for arg in "$@"; do
  [[ "$arg" == "--no-open" ]] && OPEN_TUNNEL=false
done

# ── Build on remote ───────────────────────────────────────────────────────────
echo "==> Building on remote Docker host (context: ${DOCKER_CONTEXT})..."
docker --context "$DOCKER_CONTEXT" build -t "$IMAGE" "$(dirname "$0")/.."

# ── Replace container ─────────────────────────────────────────────────────────
echo "==> Restarting container..."
docker --context "$DOCKER_CONTEXT" rm -f "$CONTAINER_NAME" 2>/dev/null || true

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading credentials from .env"
  ENV_ARGS=(--env-file "$ENV_FILE")
fi

docker --context "$DOCKER_CONTEXT" run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${PORT}:${PORT}" \
  "${ENV_ARGS[@]}" \
  "$IMAGE"

echo ""
echo "==> Done. Container running on remote:${PORT}"

# ── Optional SSH tunnel ───────────────────────────────────────────────────────
if [[ "$OPEN_TUNNEL" == "true" ]]; then
  REMOTE_HOST=$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}' 2>/dev/null | sed 's|ssh://||')
  echo "==> Tunnel: localhost:${PORT} → remote:${PORT}  (Ctrl+C to close)"
  ssh -N -L "${PORT}:localhost:${PORT}" "$REMOTE_HOST"
fi
