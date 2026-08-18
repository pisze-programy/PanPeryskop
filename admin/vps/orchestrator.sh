#!/bin/sh
# Cron PATH bootstrap ONLY — all orchestration logic lives in the pre-built
# bundle: backend/dist/vps-seed.mjs (built locally by admin/vps/build.mjs).
# One `node` process, no tsx/esbuild at runtime — fits the 256 MB shared box.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
exec node /opt/panperyskop/backend/dist/vps-seed.mjs "$@"
