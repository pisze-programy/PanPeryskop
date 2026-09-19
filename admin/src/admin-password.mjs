// Generate the admin dashboard secrets for wrangler:
//   ADMIN_PASSWORD_HASH  = "salt:iterations:hex"  (PBKDF2-SHA256, matches backend/src/admin/auth.ts)
//   ADMIN_COOKIE_SECRET  = random HMAC key for the session cookie
// Usage: node admin/src/admin-password.mjs ["plain password"]
import { webcrypto as crypto } from 'node:crypto';
import { randomBytes } from 'node:crypto';

const ITERATIONS = 100_000;

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomPassword(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return hex(bits);
}

const password = process.argv[2] || randomPassword();
const salt = hex(randomBytes(16));
const digest = await hashPassword(password, salt);

console.log(`ADMIN_PASSWORD         ${password}`);
console.log(`ADMIN_PASSWORD_HASH    ${salt}:${ITERATIONS}:${digest}`);
console.log(`ADMIN_COOKIE_SECRET    ${hex(randomBytes(32))}`);
