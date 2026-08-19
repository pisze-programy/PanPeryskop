// Shared OAuth id_token verification (Apple + Google) using WebCrypto — no dependencies.
//
// Both providers sign RS256 JWTs and publish their keys via a JWKS endpoint. We pick the
// key by `kid`, verify the signature, then check iss/aud/exp before trusting the payload.

export interface JwtPayload {
  iss: string;
  aud: string;
  exp: number;
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  name?: string;
  [key: string]: unknown;
}

export interface VerifyIdTokenOptions {
  jwksUrl: string;
  /** Allowed issuers (e.g. "https://appleid.apple.com"). */
  issuers: string[];
  /** Expected audience (Apple bundle id / Google client id). */
  audience: string;
  token: string;
  /** Clock-skew tolerance in seconds. */
  clockToleranceSec?: number;
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const bin = atob(normalized);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeSegment<T>(segment: string): T {
  const bytes = base64UrlDecode(segment);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

export interface JwksResponse {
  keys: Jwk[];
}

const jwksCache = new Map<string, { fetchedAt: number; keys: Jwk[] }>();

async function fetchJwks(jwksUrl: string): Promise<Jwk[]> {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000) {
    return cached.keys;
  }
  const resp = await fetch(jwksUrl);
  if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);
  const body = (await resp.json()) as JwksResponse;
  jwksCache.set(jwksUrl, { fetchedAt: Date.now(), keys: body.keys });
  return body.keys;
}

function bytesToB64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function verifyIdToken(options: VerifyIdTokenOptions): Promise<JwtPayload> {
  const { jwksUrl, issuers, audience, token, clockToleranceSec = 60 } = options;

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed id_token');

  const header = decodeSegment<{ alg?: string; kid?: string }>(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Unsupported algorithm');
  if (!header.kid) throw new Error('Missing kid');

  const keys = await fetchJwks(jwksUrl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) throw new Error('No matching key');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signingInput = parts[0] + '.' + parts[1];
  const signature = base64UrlDecode(parts[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, new TextEncoder().encode(signingInput));
  if (!valid) throw new Error('Invalid signature');

  const payload = decodeSegment<JwtPayload>(parts[1]);

  if (!issuers.includes(payload.iss)) throw new Error('Invalid issuer');
  if (payload.aud !== audience) throw new Error('Invalid audience');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now() - clockToleranceSec * 1000) {
    throw new Error('Token expired');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new Error('Missing sub');

  return payload;
}

export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// Sign in with Apple server-to-server event payload (the `event` JWT claim set).
// Unlike the id_token, events have no `exp` — validation is signature + iss/aud/event.
export interface AppleEventPayload {
  iss: string;
  aud: string;
  sub: string;
  event: 'emailDiscontinued' | 'consentRevoked' | 'accountDelete' | string;
  eventTime?: number;
  iat?: number;
  jti?: string;
  email?: string;
  is_private_email?: boolean;
  [key: string]: unknown;
}

// Verifies a Sign in with Apple server-to-server notification event token against
// Apple's JWKS. Mirrors verifyIdToken but skips the `exp` check (events carry
// `event`/`eventTime` instead) and only accepts the Apple issuer.
export async function verifyAppleEventToken(token: string, audience: string): Promise<AppleEventPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed event token');

  const header = decodeSegment<{ alg?: string; kid?: string }>(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Unsupported algorithm');
  if (!header.kid) throw new Error('Missing kid');

  const keys = await fetchJwks(APPLE_JWKS_URL);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) throw new Error('No matching key');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signingInput = parts[0] + '.' + parts[1];
  const signature = base64UrlDecode(parts[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, new TextEncoder().encode(signingInput));
  if (!valid) throw new Error('Invalid signature');

  const payload = decodeSegment<AppleEventPayload>(parts[1]);
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid issuer');
  if (payload.aud !== audience) throw new Error('Invalid audience');
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new Error('Missing sub');
  if (typeof payload.event !== 'string') throw new Error('Missing event');
  return payload;
}
