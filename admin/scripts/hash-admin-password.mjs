#!/usr/bin/env node
// Generate an ADMIN_PASSWORD_HASH for the admin dashboard (PBKDF2-SHA256).
// Usage: node admin/scripts/hash-admin-password.mjs [password]
// Then: echo "<hash>" | npx wrangler secret put ADMIN_PASSWORD_HASH
//       echo "<random>" | npx wrangler secret put ADMIN_COOKIE_SECRET
const pw = process.argv[2];
if (!pw || pw.length < 8) {
  console.error('Usage: node admin/scripts/hash-admin-password.mjs <password (min 8 chars)>');
  process.exit(1);
}
const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
const iterations = 100_000;
crypto.subtle
  .importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
  .then((key) => crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations, hash: 'SHA-256' }, key, 256))
  .then((bits) => {
    const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
    console.log(`${salt}:${iterations}:${hex}`);
  });
