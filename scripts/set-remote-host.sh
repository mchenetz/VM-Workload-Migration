#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# set-remote-host.sh — Update the Docker remote context to a new host
#
# Usage:
#   ./scripts/set-remote-host.sh user@hostname
#   ./scripts/set-remote-host.sh user@192.168.1.50
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 user@hostname"
  exit 1
fi

TARGET="$1"

echo "==> Removing old 'remote' context..."
docker context rm remote 2>/dev/null || true

echo "==> Creating new 'remote' context → ssh://${TARGET}"
docker context create remote --docker "host=ssh://${TARGET}"

echo "==> Switching to remote context..."
docker context use remote

echo ""
echo "✓ Docker remote context now points to: ssh://${TARGET}"
echo "  Test it with:  docker context use remote && docker info"
echo ""
echo "  Then run the app:"
echo "    ./scripts/run-remote.sh"
