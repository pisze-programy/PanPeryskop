import { CONFIG } from '../../../config/index';
// CF consumer for the v2 work-list: drain pending WORKER units, fetch each
// provider scope, stage normalized rows into seed_raw, complete the unit with
// its claim token, then reconcile any day whose fetch work is now complete.
// The unit row (D1) is the source of truth; the queue message is only a wake-up.
import { enabledProviders } from '../../providers';
import { SeedContext, SeedCandidate } from '../../core/types';
import { warsawMidnightMs, warsawDateOf, eventCreatedAtMs, eventDayEndMs, addDaysWarsaw } from '../../core/dates';
import { ClaimedUnit, claimUnit, completeUnit, failUnit, unitWindowDays } from './units';
import { writeRawRows } from './raw';
import { parseCandidate } from '../../core/candidate';

// Bound the work per invocation (CF CPU). If more remain, one extra wake-up is
// enqueued so the next invocation continues; the watchdog also retries stragglers.
const MAX_UNITS_PER_INVOCATION = 25;

export async function handleUnitWake(env: Env): Promise<void> {
  let processed = 0;
  for (;;) {
    const unit = await claimUnit(env.DB, 'worker');
    if (!unit) break;
    try {
      await runUnit(env, unit);
    } catch (e) {
      await failUnit(env.DB, unit.id, unit.token, (e as Error).message);
      console.error(`unit ${unit.provider}/${unit.slice} (${unit.day}) failed: ${(e as Error).message}`);
    }
    if (++processed >= MAX_UNITS_PER_INVOCATION) {
      const pending = await env.DB
        .prepare(`SELECT COUNT(*) AS n FROM seed_units WHERE executor='worker' AND status='pending'`)
        .first<{ n: number }>();
      if ((pending?.n ?? 0) > 0) await env.SEED_FETCH_QUEUE.send({ type: 'unit' });
      break;
    }
  }
}

async function runUnit(env: Env, unit: ClaimedUnit): Promise<void> {
  const provider = enabledProviders().find((p) => p.id === unit.provider);
  if (!provider) throw new Error(`unknown provider ${unit.provider}`);
  if (!provider.scopes.includes(unit.slice)) throw new Error(`unknown scope ${unit.slice} for ${unit.provider}`);

  const day = unit.day;
  const dayStart = warsawMidnightMs(day);
  const ctx: SeedContext = {
    env,
    day,
    dayStart,
    dayEnd: eventDayEndMs(day),
    createdAt: eventCreatedAtMs(day),
    recordBrowserMs: () => {},
  };

  const candidates = await provider.fetchScope(ctx, unit.slice);

  // Validate + group by event day. Keep ONLY the unit's window days (window
  // providers return extra days — those would otherwise never finalize). A
  // candidate with no date is filed under the unit's day as PENDING.
  const allowed = new Set(unitWindowDays(unit));
  const byDay = new Map<string, SeedCandidate[]>();
  let rejected = 0;
  let outOfWindow = 0;
  for (let i = 0; i < candidates.length; i++) {
    const r = parseCandidate(candidates[i], provider.id, i, provider.needsImage !== false);
    if (!r.ok) { rejected += 1; continue; }
    const c = r.cand;
    const d = c.startMs > 0 ? warsawDateOf(c.startMs) : unit.day;
    if (!allowed.has(d)) { outOfWindow += 1; continue; }
    const arr = byDay.get(d);
    if (arr) arr.push(c);
    else byDay.set(d, [c]);
  }
  if (rejected || outOfWindow) {
    console.log(`unit ${unit.provider}/${unit.slice}: rejected=${rejected} outOfWindow=${outOfWindow}`);
  }

  let rowsWritten = 0;
  for (const [eventDay, cands] of byDay) {
    rowsWritten += await writeRawRows(env.DB, { day: eventDay, batchId: unit.batch_id, unitId: unit.id, provider: unit.provider, candidates: cands }, CONFIG.queue.d1BatchCap);
  }

  const ok = await completeUnit(env.DB, unit.id, unit.token, rowsWritten);
  if (!ok) throw new Error('completeUnit failed (lost lease?)');

  // Wake the finalize consumer for every day this unit can write. The day that
  // was already terminal re-checks the gate and is a no-op; the day that just
  // became complete reconciles + ingests. Enqueue for ALL window days (not just
  // the ones written) — a unit that produced nothing must still let the day finalize.
  // Best-effort: the unit is done; if the wake is lost the watchdog re-enqueues it.
  try {
    for (const eventDay of unitWindowDays(unit)) {
      await env.SEED_FETCH_QUEUE.send({ type: 'finalize', day: eventDay, batchId: unit.batch_id });
    }
  } catch (e) {
    console.error(`finalize wake failed for unit ${unit.id}: ${(e as Error).message}`);
  }
}
