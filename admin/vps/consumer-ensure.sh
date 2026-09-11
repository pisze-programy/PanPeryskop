#!/bin/sh
# Supervisor for the v2 VPS seed consumer. It is a long-lived process; this
# script (run from cron every 5 min) starts it when it is not running and does
# nothing otherwise. Keeps the drain alive across crashes/reboots without a
# work-scheduling cron.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
LOGDIR=/opt/panperyskop/admin/vps/logs
mkdir -p "$LOGDIR"
if pgrep -f "seed-consumer\.mjs" >/dev/null 2>&1; then
  exit 0
fi
nohup setsid /opt/panperyskop/admin/vps/consumer.sh >> "$LOGDIR/consumer.log" 2>&1 < /dev/null &
echo "consumer (re)started $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOGDIR/consumer.log"
