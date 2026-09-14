import { time } from '../time';

const base = 'https://www.multikino.pl';
const api = `${base}/api/microservice`;

export const multikino = {
  base,
  api,
  auth: `${api}/auth/token`,
  embargo: 1,
  // Fallback when the JWT has no usable `exp` claim.
  tokenTtlMs: 12 * time.hourMs,
  thumbQuery: '&mw=240&mh=350',
} as const;
