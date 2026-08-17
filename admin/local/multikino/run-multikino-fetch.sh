#!/bin/zsh
# Local multikino seed wrapper (launchd / manual).
#   - lock (mkdir) so concurrent runs can't double-fetch
#   - PATH for launchd (minimal env)
#   - ADMIN_SECRET from admin/local/multikino/.env (gitignored)
#   - run the fetch runner (clean residential IP, checkpoint/resume)
#   - upload whatever was staged via the existing seed-ingest.mjs (idempotent)
#   - append-only log with run exit codes
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
LOG="$DIR/logs/multikino-fetch.log"
LOCK="$DIR/logs/.lock"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
[ -f "$DIR/.env" ] && set -a && source "$DIR/.env" && set +a

mkdir -p "$DIR/logs"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "[$(date "+%FT%T%z")] already running (lock present) — exit" >> "$LOG"
  exit 0
fi
trap 'rm -rf "$LOCK"' EXIT

TARGET="${1:-$(TZ=Europe/Warsaw date -v+3d +%F)}"
echo "[$(date "+%FT%T%z")] === run start target=$TARGET ===" >> "$LOG"

(
  cd "$ROOT/backend" || exit 1
  npx tsx "$ROOT/admin/local/multikino/fetch-multikino.mts" --day "$TARGET"
) >> "$LOG" 2>&1
FETCH=$?

(
  cd "$ROOT" || exit 1
  node admin/src/seed-ingest.mjs admin/seed/multikino.json --approve
) >> "$LOG" 2>&1
INGEST=$?

echo "[$(date "+%FT%T%z")] run end — fetch exit: $FETCH, ingest exit: $INGEST" >> "$LOG"
exit $(( FETCH || INGEST ))
