// Probe the full tunnel path: egress + multikino auth/showings + cinemacity,
// all through the IPv4-forcing proxy (HTTPS_PROXY set by the wrapper).
const AUTH = 'https://www.multikino.pl/api/microservice/auth/token';
const DAY = '2026-08-18';

async function egress() {
  const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(20000) });
  console.log('egress:', await r.text());
}

async function multikino() {
  const r = await fetch(AUTH, { method: 'POST', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  console.log('multikino auth:', r.status);
  if (r.status !== 200) return;
  const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  const m = /microservicesToken=([^;]+)/.exec(cookies.join(';') || '');
  const token = m?.[1];
  if (!token) { console.log('no token'); return; }
  const s = await fetch(
    `https://www.multikino.pl/api/microservice/showings/cinemas/0006/films?showingDate=${DAY}&minEmbargoLevel=1&includesSession=true&includeSessionAttributes=true`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) }
  );
  const data = await s.json();
  console.log('multikino showings:', s.status, 'films:', (data.result || []).length);
}

async function cinemacity() {
  const r = await fetch(
    `https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/10103/film-events/in-cinema/1100/at-date/${DAY}`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) }
  );
  const b = await r.json();
  console.log('cinemacity:', r.status, 'films:', ((b.body || {}).films || []).length);
}

try { await egress(); } catch (e) { console.log('egress ERR:', e.message); }
try { await multikino(); } catch (e) { console.log('multikino ERR:', e.message); }
try { await cinemacity(); } catch (e) { console.log('cinemacity ERR:', e.message); }
