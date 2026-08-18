#!/bin/sh
# PanPeryskop VPS deploy — ONE command from the Mac.
#   sh admin/vps/deploy.sh
#
# Builds the app payload (backend/src/seed + admin/vps + seed-ingest, NO git),
# pushes it + setup-vps.sh to the VPS, and runs the bootstrap there (as root via
# the NOPASSWD sudo rule). Idempotent — safe on a live box, designed for a wipe:
# wipe → (re-add your SSH key / the `frog` alias) → run THIS → box is back up.
#
# Env: HOST=frog (ssh alias), IPHONE_HOST=iphone-14-pro-max
set -eu

HOST="${HOST:-frog}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TGZ="/tmp/pp-deploy.tgz"

echo "== build payload =="
cd "$ROOT"
tar -czf "$TGZ" \
  --exclude='.DS_Store' --exclude='admin/vps/logs' --exclude='admin/vps/.env' \
  backend/src/seed \
  backend/src/admin/cities.ts \
  admin/vps \
  admin/src/seed-ingest.mjs
echo "payload: $TGZ ($(du -h "$TGZ" | cut -f1))"

echo "== push to $HOST =="
scp -q "$TGZ" admin/vps/setup-vps.sh "$HOST:/tmp/"
echo "pushed"

echo "== run bootstrap on $HOST (root) =="
ssh "$HOST" "sudo -n sh /tmp/setup-vps.sh"
