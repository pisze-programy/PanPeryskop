#!/bin/sh
# PanPeryskop VPS deploy — ONE command from the Mac.
#   sh admin/vps/deploy.sh
#
# Builds the pre-built VPS bundles (backend/dist/seed-consumer.mjs + warms — no
# TS/tsx on the VPS), pushes them + the VPS scripts to the server, and runs the
# bootstrap there (root via the NOPASSWD sudo rule). Idempotent — safe on a live
# box, designed for a wipe: wipe → (re-add your SSH key / the `frog` alias) →
# run THIS → box is back up.
#
# Env: HOST=frog (ssh alias)
set -eu

HOST="${HOST:-frog}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "== build bundle =="
node "$ROOT/admin/vps/build.mjs"

echo "== push to $HOST =="
scp -r -q "$ROOT/backend/dist/seed-consumer.mjs" "$ROOT/backend/dist/kup-warm.mjs" "$ROOT/backend/dist/awin-warm.mjs" "$ROOT/backend/dist/travel-espn.mjs" "$ROOT/admin/vps/consumer.sh" "$ROOT/admin/vps/consumer-ensure.sh" "$ROOT/admin/vps/setup-vps.sh" "$ROOT/admin/vps/ipv4-proxy.mjs" "$HOST:/tmp/"
echo "pushed"

echo "== run bootstrap on $HOST (root) =="
ssh "$HOST" "sudo -n sh /tmp/setup-vps.sh"
