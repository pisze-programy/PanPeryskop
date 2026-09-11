#!/bin/sh
# PanPeryskop VPS bootstrap — the ONE script that brings a wiped mikr.us box back
# to a working seed host. Idempotent: safe to re-run on an already-set-up box.
#
# Run (as root): the Mac-side ONE command does this for you:
#   sh admin/vps/deploy.sh
# which scp's THIS script + the pre-built bundle (vps-seed.mjs) to /tmp and runs:
#   sudo -n sh /tmp/setup-vps.sh
#
# What it does (each step idempotent):
#   1. installs node/npm/tailscale/imagemagick/ffmpeg + global tsx
#   2. enables NOPASSWD sudo for the deploy user (frog) — key-only SSH then works
#      without prompts (automation), 3. joins tailnet with the phone as exit node
#   4. deploys the app payload (backend/src/seed + admin/vps + seed-ingest) — NO git
#   5. installs the root crontab: seed kick every 5 min all day (05-22 PL window
#      is enforced in the orchestrator; off-window kicks are no-ops)
#   6. self-test: orchestrator --dry, then prints next steps (backfill --full).
set -u

DEPLOY_USER="${DEPLOY_USER:-frog}"
REPO_DIR=/opt/panperyskop
ENV_FILE="$REPO_DIR/admin/vps/.env"

stamp() { date '+%F %T'; }
say()  { echo "[$(stamp)] $*"; }

[ "$(id -u)" = 0 ] || { echo "run as root (or via sudo)"; exit 1; }

# ---------- 1. installs ----------
if command -v apk >/dev/null 2>&1; then
  apk add --no-cache nodejs npm imagemagick ffmpeg curl bash
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y nodejs npm imagemagick ffmpeg curl
else
  say "WARN: nieznany menedżer pakietów — pomijam instalację"
fi
command -v tsx >/dev/null 2>&1 || npm i -g tsx
say "installs ok (node=$(node -v 2>/dev/null || echo '?'))"

# ---------- 2. NOPASSWD sudo for the deploy user ----------
if ! grep -qs "$DEPLOY_USER" /etc/sudoers.d/10-panperyskop 2>/dev/null; then
  echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/10-panperyskop
  chmod 440 /etc/sudoers.d/10-panperyskop
  say "sudoers NOPASSWD ok ($DEPLOY_USER)"
else
  say "sudoers NOPASSWD already set"
fi

# ---------- 4. deploy the pre-built bundles + scripts (NO git, no TS on the box) ----------
# deploy.sh ships these to /tmp: seed-consumer.mjs (v2 drain consumer), the warm
# bundles, consumer.sh (launcher), consumer-ensure.sh (supervisor), setup-vps.sh,
# ipv4-proxy.mjs. .env and logs stay in place.
SRC_TMP="/tmp"
mkdir -p "$REPO_DIR/backend/dist" "$REPO_DIR/admin/vps"
install -m 0644 "$SRC_TMP/seed-consumer.mjs" "$REPO_DIR/backend/dist/seed-consumer.mjs"
install -m 0644 "$SRC_TMP/kup-warm.mjs"    "$REPO_DIR/backend/dist/kup-warm.mjs"
install -m 0644 "$SRC_TMP/awin-warm.mjs"   "$REPO_DIR/backend/dist/awin-warm.mjs"
install -m 0644 "$SRC_TMP/travel-espn.mjs" "$REPO_DIR/backend/dist/travel-espn.mjs"
install -m 0755 "$SRC_TMP/consumer.sh"        "$REPO_DIR/admin/vps/consumer.sh"
install -m 0755 "$SRC_TMP/consumer-ensure.sh" "$REPO_DIR/admin/vps/consumer-ensure.sh"
install -m 0755 "$SRC_TMP/setup-vps.sh"    "$REPO_DIR/admin/vps/setup-vps.sh"
install -m 0644 "$SRC_TMP/ipv4-proxy.mjs"  "$REPO_DIR/admin/vps/ipv4-proxy.mjs"
say "bundle + scripts installed into $REPO_DIR"

# Remove legacy files (old orchestrator + seed-ingest uploader).
rm -f "$REPO_DIR/backend/dist/vps-seed.mjs" "$REPO_DIR/admin/vps/orchestrator.sh" \
      "$REPO_DIR/admin/src/seed-ingest.mjs" "$REPO_DIR/admin/vps/watchdog.sh" \
      "$REPO_DIR/admin/vps/watchdog.s" "$REPO_DIR/admin/vps/select-exit-node.sh" \
      "$REPO_DIR/admin/vps/fetch-cinemas.mts"
rm -rf "$REPO_DIR/admin/src/seed"
say "legacy files cleaned"

# ---------- 5. crontab (preserve system + user entries; swap our seed lines) ----------
TMP_CRON=$(mktemp)
crontab -l 2>/dev/null | grep -vE 'panperyskop.*(watchdog|orchestrator)\.sh|vps-seed\.mjs|(kup-warm|awin-warm|travel-espn|consumer-ensure)\.(mjs|sh)' > "$TMP_CRON"
# Seed consumer supervisor — restart the long-lived drain within 5 min if it dies.
printf '%s\n' '*/5 * * * * /opt/panperyskop/admin/vps/consumer-ensure.sh' >> "$TMP_CRON"
# Nightly kupbilecik manifest warm — 00:01 Warsaw, CLEAN env (no proxy: the origin
# needs none and we don't pay residential bandwidth for an 8 MB gzip download).
printf '%s\n' '1 0 * * * cd /opt/panperyskop && /usr/bin/node --max-old-space-size=128 backend/dist/kup-warm.mjs >> admin/vps/logs/warm-kup.log 2>&1' >> "$TMP_CRON"
# Eventim (Awin) feed warm — 00:03 Warsaw, after the kupbilecik warm.
printf '%s\n' '3 0 * * * cd /opt/panperyskop && /usr/bin/node --max-old-space-size=128 backend/dist/awin-warm.mjs >> admin/vps/logs/warm-awin.log 2>&1' >> "$TMP_CRON"
# ESPN travel replenish — Monday 00:10 Warsaw.
printf '%s\n' '10 0 * * 1 cd /opt/panperyskop && /usr/bin/node --max-old-space-size=128 backend/dist/travel-espn.mjs >> admin/vps/logs/travel-espn.log 2>&1' >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"
say "crontab ok: */5 consumer-ensure + 00:01 kup-warm + 00:03 awin-warm + 00:10 mon travel-espn"

# ---------- env ----------
if [ -f "$ENV_FILE" ]; then
  say "env ok ($ENV_FILE)"
else
  say "UWAGA: brak $ENV_FILE — wgraj BASE_URL + ADMIN_SECRET"
fi

# ---------- 6. self-test + start the consumer ----------
say "self-test: consumer scripts"
sh -n "$REPO_DIR/admin/vps/consumer.sh" && sh -n "$REPO_DIR/admin/vps/consumer-ensure.sh" && say "scripts ok"
"$REPO_DIR/admin/vps/consumer-ensure.sh" || true
cd /

cat <<'SUMMARY'

=== PanPeryskop VPS ready ===
The v2 consumer is a long-lived drain process; the */5 consumer-ensure cron keeps
it alive and starts it automatically. Logs:
  tail -f /opt/panperyskop/admin/vps/logs/consumer.log
  tail -f /opt/panperyskop/admin/vps/logs/load.log
Seed planning runs on the Cloudflare Worker (every 3 days) — no VPS seed cron.
SUMMARY
