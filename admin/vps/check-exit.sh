      #!/bin/sh
# Reusable egress probe for ANY project on the VPS. With the iPhone Tailscale
# exit node active, the default route egresses via the phone's cellular IP.
# Run anytime to confirm the residential egress works:
#   sh /opt/panperyskop/admin/vps/check-exit.sh [YYYY-MM-DD]
set -u
export TZ=Europe/Warsaw
DAY=${1:-$(date -d "+1 day" +%F 2>/dev/null || date +%F)}
UA='Mozilla/5.0'

echo "== egress =="
IP=$(curl -s --max-time 15 https://api.ipify.org || curl -s --max-time 15 https://ifconfig.me/ip)
echo "ip: ${IP:-unknown}  |  day: $DAY"

echo "== multikino (requires residential/cellular — the point of the exit node) =="
curl -s -o /dev/null -w "  auth: %{http_code}\n" --max-time 20 -X POST \
  "https://www.multikino.pl/api/microservice/auth/token" -H "Accept: application/json"

echo "== cinemacity (works from any IP, reference) =="
curl -s -o /dev/null -w "  quickbook: %{http_code}\n" --max-time 20 -H "Accept: application/json" \
  "https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/10103/film-events/in-cinema/1100/at-date/$DAY"

echo "== helios (plain Apache, reference) =="
curl -s -o /dev/null -w "  api: %{http_code}\n" --max-time 20 -H "Accept: application/json" \
  "https://api.helios.pl/api/v1/cinemas"
