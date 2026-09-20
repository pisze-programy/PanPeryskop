#!/usr/bin/env bash
# Deploy the Worker and upload its source maps to Sentry so stack traces are
# readable. The deploy id (CF_VERSION_METADATA.id) is the Sentry release, so an
# event and its map always match. Upload is skipped when SENTRY_AUTH_TOKEN is
# not set — the deploy still succeeds, only symbolication is lost.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT="dist"
rm -rf "$OUT"

echo "▸ Building Worker (outdir $OUT)"
npx wrangler deploy --config wrangler.toml --outdir "$OUT" --dry-run >/dev/null

echo "▸ Deploying"
DEPLOY_LOG=$(npx wrangler deploy --config wrangler.toml 2>&1)
echo "$DEPLOY_LOG" | tail -5

if [[ -z "${SENTRY_AUTH_TOKEN:-}" ]]; then
  echo "▸ SENTRY_AUTH_TOKEN not set — skipping source map upload"
  exit 0
fi

RELEASE=$(echo "$DEPLOY_LOG" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1)
if [[ -z "$RELEASE" ]]; then
  echo "▸ Could not read the deploy id from wrangler output — skipping map upload"
  exit 0
fi

echo "▸ Uploading source maps for release $RELEASE"
npx sentry-cli sourcemaps upload \
  --org blaszczyk --project node-hono \
  --release "$RELEASE" \
  --url-prefix '~/' \
  "$OUT"
