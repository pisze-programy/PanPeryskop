#!/bin/sh
# Cron PATH bootstrap ONLY — all orchestration logic lives in the pre-built
# bundle: backend/dist/vps-seed.mjs (built locally by admin/vps/build.mjs).
# One `node` process, no tsx/esbuild at runtime — fits the 256 MB shared box.
#
# Proxy env is set HERE (at launch), not at runtime: NODE_USE_ENV_PROXY is
# parsed by Node at startup, so a runtime assignment is a no-op on newer Node.
# This routes every in-process fetch (providers + media) through the proxy.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

# Load .env (KEY=VALUE) so WEBSHARE_URL (if configured) is available to the shell.
ENV_FILE=/opt/panperyskop/admin/vps/.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE" 2>/dev/null || true

# Egress is the Webshare rotating residential proxy (WEBSHARE_URL) — the tailscale
# exit node + ipv4-proxy were removed, so this is now REQUIRED.
if [ -z "${WEBSHARE_URL:-}" ]; then
  echo "WEBSHARE_URL not set in $ENV_FILE — no residential egress configured" >&2
  exit 1
fi
export HTTPS_PROXY="$WEBSHARE_URL"
export NO_PROXY="api.panperyskop.app"
export VPS_NO_EXIT_NODE="1"
export NODE_USE_ENV_PROXY="1"
# Hard heap ceiling (256 MB box, ~80 MB baseline) + --expose-gc for the
# per-scope / between-provider gcNow() calls. If V8 can't stay under the cap it
# fails INSIDE the process (checkpointed, next kick resumes) instead of the OS
# OOM-killer taking everything down.
exec node --max-old-space-size=170 --expose-gc /opt/panperyskop/backend/dist/vps-seed.mjs "$@"
