#!/bin/sh
# Launcher for the flight-schedule drain (route_days). Sets the residential proxy
# BEFORE node starts — NODE_USE_ENV_PROXY is read at launch, and the provider
# throttles datacenter IPs. Same egress rule as consumer.sh.
#   sh /opt/panperyskop/admin/vps/route-days.sh
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

ENV_FILE=/opt/panperyskop/admin/vps/.env
set -a
[ -f "$ENV_FILE" ] && . "$ENV_FILE" 2>/dev/null || true
set +a

if [ -z "${WEBSHARE_URL:-}" ]; then
  echo "WEBSHARE_URL not set in $ENV_FILE — no residential egress configured" >&2
  exit 1
fi
export HTTPS_PROXY="$WEBSHARE_URL"
export NO_PROXY="api.panperyskop.app"
export NODE_USE_ENV_PROXY="1"

exec node --max-old-space-size=192 /opt/panperyskop/backend/dist/travel.mjs --provider=route-days "$@"
