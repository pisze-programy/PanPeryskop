#!/bin/sh
# Supervisor for the v2 VPS seed consumer. It is a long-lived process; this script
# (run from cron every 5 min) starts it when it is not running AND restarts it when
# the bundle changed. A deploy only replaces the file: a consumer that kept running
# would hold the previous code — and the previous coordinates — in memory forever.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
LOGDIR=/opt/panperyskop/admin/vps/logs
BUNDLE=/opt/panperyskop/backend/dist/seed-consumer.mjs
STAMP=$LOGDIR/consumer-bundle.stamp
mkdir -p "$LOGDIR"
cur=$(stat -c %Y "$BUNDLE" 2>/dev/null || echo "")
old=$(cat "$STAMP" 2>/dev/null || echo "")
if [ -n "$cur" ] && [ "$cur" != "$old" ] && pgrep -f "seed-consumer\.mjs" >/dev/null 2>&1; then
  echo "consumer restart: bundle changed $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOGDIR/consumer.log"
  pkill -f "seed-consumer\.mjs" 2>/dev/null || true
  sleep 2
fi
if [ -n "$cur" ]; then echo "$cur" > "$STAMP"; fi
if pgrep -f "seed-consumer\.mjs" >/dev/null 2>&1; then
  exit 0
fi
nohup setsid /opt/panperyskop/admin/vps/consumer.sh >> "$LOGDIR/consumer.log" 2>&1 < /dev/null &
echo "consumer (re)started $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOGDIR/consumer.log"
