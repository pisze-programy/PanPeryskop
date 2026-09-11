#!/bin/sh
# Launcher for the v2 VPS seed consumer. Sets the residential-proxy env BEFORE
# node starts (NODE_USE_ENV_PROXY is read at startup) and runs the bundled
# consumer. No cron, no windows — the consumer drains the durable work-list.
#   sh /opt/panperyskop/admin/vps/consumer.sh
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

ENV_FILE=/opt/panperyskop/admin/vps/.env
# `set -a` exports every var sourced from .env, so the provider modules (which
# read process.env at run time) actually see ALGOLIA_*, CLOUDINARY_SIG, tokens…
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

exec node --max-old-space-size=160 /opt/panperyskop/backend/dist/seed-consumer.mjs "$@"
