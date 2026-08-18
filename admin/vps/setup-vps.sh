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

IPHONE_HOST="${IPHONE_HOST:-iphone-14-pro-max}"
DEPLOY_USER="${DEPLOY_USER:-frog}"
REPO_DIR=/opt/panperyskop
ENV_FILE="$REPO_DIR/admin/vps/.env"

stamp() { date '+%F %T'; }
say()  { echo "[$(stamp)] $*"; }

[ "$(id -u)" = 0 ] || { echo "run as root (or via sudo)"; exit 1; }

# ---------- 1. installs ----------
if command -v apk >/dev/null 2>&1; then
  apk add --no-cache nodejs npm tailscale imagemagick ffmpeg curl bash
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y nodejs npm tailscale imagemagick ffmpeg curl
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

# ---------- 3. tailnet + exit node ----------
if command -v tailscale >/dev/null 2>&1; then
  tailscale up --exit-node="$IPHONE_HOST" --exit-node-allow-lan-access || say "WARN: tailscale up — sprawdź, czy telefon jest w sieci"
  say "tailscale ok (exit node=$IPHONE_HOST)"
else
  say "WARN: brak tailscale"
fi

# ---------- 3b. IPv4 proxy as a system daemon (survives reboots/crashes) ----------
if command -v rc-update >/dev/null 2>&1; then
  cat > /etc/init.d/panperyskop-proxy <<'SVCEOF'
#!/sbin/openrc-run
# PanPeryskop IPv4-forcing HTTP CONNECT proxy — dials via tailscaled SOCKS (1055)
# to the selected exit node. Managed as a system daemon so it survives reboots and
# crashes (supervise-daemon restarts it); the seed orchestrator relies on 127.0.0.1:1057.
name="panperyskop-ipv4-proxy"
description="IPv4-forcing HTTP CONNECT proxy for the residential-egress seed"
command="/usr/bin/node"
command_args="/opt/panperyskop/admin/vps/ipv4-proxy.mjs"
command_background=true
pidfile="/run/panperyskop-proxy.pid"
output_log="/opt/panperyskop/admin/vps/logs/ipv4-proxy.log"
error_log="${output_log}"
directory="/opt/panperyskop/admin/vps"
depend() { need net; after tailscale; }
SVCEOF
  chmod +x /etc/init.d/panperyskop-proxy
  rc-update add panperyskop-proxy default 2>/dev/null || true
  rc-service panperyskop-proxy start 2>/dev/null || true
  say "ipv4-proxy service ok"
else
  say "WARN: brak openrc — ipv4-proxy uruchamiany ad-hoc (mniej niezawodny)"
fi

# ---------- 4. deploy the pre-built bundle + scripts (NO git, no TS on the box) ----------
# deploy.sh ships these to /tmp: vps-seed.mjs (bundle), orchestrator.sh,
# setup-vps.sh, ipv4-proxy.mjs, seed-ingest.mjs. .env and logs stay in place.
SRC_TMP="/tmp"
mkdir -p "$REPO_DIR/backend/dist" "$REPO_DIR/admin/vps" "$REPO_DIR/admin/src"
install -m 0644 "$SRC_TMP/vps-seed.mjs"    "$REPO_DIR/backend/dist/vps-seed.mjs"
install -m 0755 "$SRC_TMP/orchestrator.sh" "$REPO_DIR/admin/vps/orchestrator.sh"
install -m 0755 "$SRC_TMP/setup-vps.sh"    "$REPO_DIR/admin/vps/setup-vps.sh"
install -m 0644 "$SRC_TMP/ipv4-proxy.mjs"  "$REPO_DIR/admin/vps/ipv4-proxy.mjs"
install -m 0644 "$SRC_TMP/seed-ingest.mjs" "$REPO_DIR/admin/src/seed-ingest.mjs"
say "bundle + scripts installed into $REPO_DIR"

# Remove legacy/obsolete admin/vps files (replaced by the executor).
rm -f "$REPO_DIR/admin/vps/watchdog.sh" "$REPO_DIR/admin/vps/watchdog.s" \
      "$REPO_DIR/admin/vps/select-exit-node.sh" "$REPO_DIR/admin/vps/fetch-cinemas.mts"
say "legacy files cleaned"

# ---------- 5. crontab (preserve system + user entries; swap our seed line) ----------
TMP_CRON=$(mktemp)
crontab -l 2>/dev/null | grep -vE 'panperyskop.*(watchdog|orchestrator)\.sh' > "$TMP_CRON"
printf '%s\n' '*/5 * * * * /opt/panperyskop/admin/vps/orchestrator.sh' >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"
say "crontab ok: */5 * * * * orchestrator.sh (co 5 min cały dzień, okno 05-22 PL)"

# ---------- env ----------
if [ -f "$ENV_FILE" ]; then
  say "env ok ($ENV_FILE)"
else
  say "UWAGA: brak $ENV_FILE — wgraj BASE_URL + ADMIN_SECRET"
fi

# ---------- 6. self-test ----------
say "self-test: orchestrator --dry (bundle)"
cd "$REPO_DIR/backend" && node dist/vps-seed.mjs --dry 2>&1 | tail -12
cd /

cat <<'SUMMARY'

=== PanPeryskop VPS ready ===
Następny krok (pierwszy seed całego okna, jednorazowo):
  sudo -n node /opt/panperyskop/backend/dist/vps-seed.mjs --full

Status / logi:
  cat /opt/panperyskop/admin/vps/logs/status.json
  tail -f /opt/panperyskop/admin/vps/logs/orchestrator.log
SUMMARY
