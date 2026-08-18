#!/bin/sh
# PanPeryskop VPS deploy — ONE command from the Mac.
#   sh admin/vps/deploy.sh
#
# Builds the pre-built seed bundle (backend/dist/vps-seed.mjs — no TS/tsx on the
# VPS, one node process), pushes it + the VPS scripts to the server, and runs the
# bootstrap there (root via the NOPASSWD sudo rule). Idempotent — safe on a live
# box, designed for a wipe: wipe → (re-add your SSH key / the `frog` alias) →
# run THIS → box is back up.
#
# Env: HOST=frog (ssh alias), IPHONE_HOST=iphone-14-pro-max
set -eu

HOST="${HOST:-frog}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "== build bundle =="
node "$ROOT/admin/vps/build.mjs"

echo "== push to $HOST =="
scp -q "$ROOT/backend/dist/vps-seed.mjs" "$ROOT/admin/vps/orchestrator.sh" "$ROOT/admin/vps/setup-vps.sh" "$ROOT/admin/vps/ipv4-proxy.mjs" "$ROOT/admin/src/seed-ingest.mjs" "$HOST:/tmp/"
echo "pushed"

echo "== run bootstrap on $HOST (root) =="
ssh "$HOST" "sudo -n sh /tmp/setup-vps.sh"
