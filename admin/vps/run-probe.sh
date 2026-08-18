#!/bin/sh
# Start ipv4-proxy, run the probe through it, clean up. Used for one-off tests.
set -u
pkill -f ipv4-proxy.mjs 2>/dev/null
sleep 1
node /home/frog/panperyskop/admin/vps/ipv4-proxy.mjs > /home/frog/panperyskop/admin/vps/logs/ipv4-proxy.log 2>&1 &
PX=$!
sleep 2
HTTPS_PROXY=http://127.0.0.1:1057 NODE_USE_ENV_PROXY=1 node /home/frog/panperyskop/admin/vps/probe.mjs
RC=$?
kill "$PX" 2>/dev/null
exit "$RC"
