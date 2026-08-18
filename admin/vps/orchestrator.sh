#!/bin/sh
# Cron PATH bootstrap ONLY — all orchestration logic lives in the VPS executor:
# backend/src/seed/executors/vps/index.ts. Cron runs with a minimal PATH;
# tsx/node/tailscale need the normal bin dirs.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd /opt/panperyskop/backend
exec npx --yes tsx /opt/panperyskop/backend/src/seed/executors/vps/index.ts "$@"
