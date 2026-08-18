#!/bin/sh
# FROG egress probe — can a mikr.us datacenter IP fetch the cinema APIs that the
# local Mac launchd currently handles? Run ON the FROG server (Alpine).
#
#   scp admin/vps/test-frog-egress.sh frog:/root/ && ssh frog 'sh /root/test-frog-egress.sh'
#
# Pass/Fail tells us whether the Worker-side move is viable:
#   multikino + cinemacity sit behind Cloudflare Bot Management (__cf_bm) and
#   403 automated/datacenter egress (that's why they run from the clean
#   residential Mac). A datacenter IP like mikr.us may still 403 — this script
#   measures it. helios (plain Apache API) is the reference "should always work".
set -u

if ! command -v curl >/dev/null 2>&1; then
  echo "curl missing — run:  apk add curl"
  exit 1
fi

# Target day (default: tomorrow Europe/Warsaw; busybox date has no -d, so allow
# passing it explicitly:  sh test-frog-egress.sh 2026-08-18).
DAY=${1:-}
if [ -z "$DAY" ]; then
  DAY=$(TZ=Europe/Warsaw date -d "+1 day" +%F 2>/dev/null)
  [ -n "$DAY" ] || DAY=$(TZ=Europe/Warsaw date -v+1d +%F 2>/dev/null)
  [ -n "$DAY" ] || DAY=$(TZ=Europe/Warsaw date +%F)
fi
UA='Mozilla/5.0'
TMP=$(mktemp -d)

fetch_code_size() { # $1=url $2..=extra curl args -> echoes "CODE BYTES"
  curl -s -o "$TMP/body" -w "%{http_code} %{size_download}" --max-time 20 -A "$UA" "$@"
}

echo "=== EGRESS ==="
IP=$(curl -s --max-time 10 https://api.ipify.org 2>/dev/null || curl -s --max-time 10 https://ifconfig.me/ip 2>/dev/null)
echo "egress ip: ${IP:-unknown}  |  target day: $DAY"

echo
echo "=== HELIOS (reference — plain Apache API, no bot mgmt) ==="
set -- "https://api.helios.pl/api/v1/cinemas" -H "Accept: application/json"
cs=$(fetch_code_size "$@")
echo "GET  /api/v1/cinemas            -> $cs"
HELIOS_OK=1

echo
echo "=== CINEMACITY (Cloudflare + __cf_bm) ==="
CC="https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/10103/film-events/in-cinema/1100/at-date/$DAY"
cs=$(fetch_code_size "$CC" -H "Accept: application/json")
code=${cs%% *}; size=${cs##* }
films=$(awk -F'"posterLink"' '{print NF-1}' "$TMP/body" 2>/dev/null)
echo "GET  quickbook in-cinema/1100    -> $cs  | films: ${films:-?}"
CC_OK=0; [ "$code" = "200" ] && [ "${films:-0}" -gt 0 ] && CC_OK=1

echo
echo "=== MULTIKINO (Cloudflare + __cf_bm, token-gated) ==="
AUTHHDR=$(curl -s -D - -o /dev/null --max-time 20 -X POST "https://www.multikino.pl/api/microservice/auth/token" -H "Accept: application/json")
auth_code=$(echo "$AUTHHDR" | grep -i '^HTTP' | tail -1 | awk '{print $2}')
TOKEN=$(echo "$AUTHHDR" | grep -i 'set-cookie: *microservicesToken=' | sed 's/.*microservicesToken=\([^;]*\).*/\1/' | tr -d '\r')
echo "POST /auth/token                 -> ${auth_code:-?}  | token len: ${#TOKEN}"
MK_OK=0
if [ -n "$TOKEN" ] && [ "${auth_code:-0}" = "200" ]; then
  MK="https://www.multikino.pl/api/microservice/showings/cinemas/0006/films?showingDate=$DAY&minEmbargoLevel=1&includesSession=true&includeSessionAttributes=true"
  cs=$(fetch_code_size "$MK" -H "Authorization: Bearer $TOKEN" -H "Accept: application/json")
  code=${cs%% *}; size=${cs##* }
  films=$(awk -F'"filmTitle"' '{print NF-1}' "$TMP/body" 2>/dev/null)
  echo "GET  showings 0006               -> $cs  | films: ${films:-?}"
  [ "$code" = "200" ] && [ "${films:-0}" -gt 0 ] && MK_OK=1

  echo "burst: 5 rapid showings calls (rate-limit check):"
  burst=""
  for i in 1 2 3 4 5; do
    c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -A "$UA" -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" "$MK")
    burst="$burst $i=$c"
  done
  echo "  ->$burst"
  case "$burst" in *403*) MK_OK=0;; esac
fi

echo
echo "=== VERDICT ==="
echo "  helios     : $([ "$HELIOS_OK" = 1 ] && echo OK || echo FAIL)"
echo "  cinemacity : $([ "$CC_OK" = 1 ] && echo OK || echo FAIL)"
echo "  multikino  : $([ "$MK_OK" = 1 ] && echo OK || echo FAIL)"
if [ "$CC_OK" = 1 ] && [ "$MK_OK" = 1 ]; then
  echo "  -> datacenter egress works for both — launchd CAN be replaced (migrate to this box)."
else
  echo "  -> Cloudflare bot management still blocks this datacenter IP — keep the local Mac (launchd)."
fi

rm -rf "$TMP"
