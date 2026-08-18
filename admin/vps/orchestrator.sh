#!/bin/sh
# Cron PATH bootstrap ONLY — all orchestration logic lives in the pre-built
# bundle: backend/dist/vps-seed.mjs (built locally by admin/vps/build.mjs).
# One `node` process, no tsx/esbuild at runtime — fits the 256 MB shared box.
#
# Proxy env is set HERE (at launch), not at runtime: NODE_USE_ENV_PROXY is
# parsed by Node at startup, so a runtime assignment is a no-op on newer Node.
# This routes every in-process fetch (providers + media) through the IPv4 proxy
# → exit node (residential egress), which Cloudflare-fronted origins require.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
export HTTPS_PROXY="http://127.0.0.1:1057"
export NODE_USE_ENV_PROXY="1"
exec node /opt/panperyskop/backend/dist/vps-seed.mjs "$@"
