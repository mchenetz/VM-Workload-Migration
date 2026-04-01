#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-remote.sh
#
# Runs the vm-migration-estimator container on the remote Docker host and
# opens an SSH tunnel so http://localhost:3001 on THIS machine hits the app
# running on the remote host.
#
# Usage:
#   ./scripts/run-remote.sh [image-tag]
#
# Examples:
#   ./scripts/run-remote.sh              # uses latest published image
#   ./scripts/run-remote.sh 1.0.4        # specific version
#   ./scripts/run-remote.sh local        # uses a locally-built image (see below)
#
# Prerequisites:
#   1. SSH key-based auth to REMOTE_HOST (no password prompt)
#   2. Docker installed on REMOTE_HOST
#   3. REMOTE_HOST has network access to vCenter / OpenShift / FlashArray
#
# To update the remote host:
#   export REMOTE_HOST=user@your-server.example.com
#   or edit the default below.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-mchenetz@mac.localdomain}"
IMAGE_REPO="ghcr.io/mchenetz/vm-migration-estimator"
TAG="${1:-latest}"
CONTAINER_NAME="vm-migration-estimator"
REMOTE_PORT=3001
LOCAL_PORT=3001

# ── Resolve image ─────────────────────────────────────────────────────────────
if [[ "$TAG" == "local" ]]; then
  echo "==> Building image locally and pushing to remote Docker host..."
  docker context use remote
  IMAGE="${CONTAINER_NAME}:local"
  docker build -t "$IMAGE" .
else
  IMAGE="${IMAGE_REPO}:${TAG}"
  echo "==> Using published image: $IMAGE"
fi

# ── Switch to remote Docker context ──────────────────────────────────────────
echo "==> Switching to remote Docker context..."
docker context use remote

# ── Stop any existing container ───────────────────────────────────────────────
echo "==> Stopping existing container (if any)..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# ── Start the container on the remote host ───────────────────────────────────
echo "==> Starting container on remote host ($REMOTE_HOST)..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${REMOTE_PORT}:${REMOTE_PORT}" \
  -e NODE_ENV=production \
  "$IMAGE"

echo ""
echo "==> Container started on remote host."
echo "    Remote:  http://${REMOTE_HOST%%@*}:${REMOTE_PORT}"
echo ""

# ── Open SSH tunnel back to local machine ─────────────────────────────────────
echo "==> Opening SSH tunnel: localhost:${LOCAL_PORT} → remote:${REMOTE_PORT}"
echo "    Access the app at: http://localhost:${LOCAL_PORT}"
echo "    Press Ctrl+C to close the tunnel."
echo ""

ssh -N -L "${LOCAL_PORT}:localhost:${REMOTE_PORT}" "$REMOTE_HOST"
