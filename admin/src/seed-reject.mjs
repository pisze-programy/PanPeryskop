#!/usr/bin/env node
// One-off cleanup: reject seed posts by external_id in a batch.
//   BASE_URL=https://api.panperyskop.app ADMIN_SECRET=... node admin/src/seed-reject.mjs --reason "blacklist: duplikat" going-2414789 going-2415116 ...
//
// Calls POST /admin/seed/reject (Bearer) — the same reject the moderation flow
// uses, auditable in rejection_reason and reversible via approve.
const BASE_URL = process.env.BASE_URL || 'https://api.panperyskop.app';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const argv = process.argv.slice(2);
const reasonIdx = argv.indexOf('--reason');
const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : null;
const ids = (reasonIdx >= 0 ? argv.filter((_, i) => i !== reasonIdx && i !== reasonIdx + 1) : argv)
  .filter((x) => /^[a-z0-9_-]{1,200}$/i.test(x));

if (!ADMIN_SECRET) {
  console.error('ADMIN_SECRET required');
  process.exit(1);
}
if (!ids.length) {
  console.error('usage: seed-reject.mjs [--reason "..."] <external_id> [external_id ...]');
  process.exit(1);
}

const res = await fetch(`${BASE_URL}/admin/seed/reject`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ADMIN_SECRET}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ids, reason }),
  signal: AbortSignal.timeout(30_000),
});
if (!res.ok) {
  console.error(`POST /admin/seed/reject -> ${res.status}`);
  process.exit(1);
}
const data = await res.json();
console.log(`rejected=${data.rejected} requested=${data.requested}`);
console.log('ids:', ids.join(' '));
