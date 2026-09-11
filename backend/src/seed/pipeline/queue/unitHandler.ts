// CF consumer for the v2 work-list: drain pending WORKER units, fetch each
// provider scope, stage normalized rows into seed_raw, complete the unit with
// its claim token, then reconcile any day whose fetch work is now complete.
// The unit row (D1) is the source of truth; the queue message is only a wake-up.
import { enabledProviders } from '../../providers';
import { SeedContext, SeedCandidate } from '../../core/types';
import { warsawMidnightMs, warsawDateOf, eventCreatedAtMs, eventDayEndMs } from '../../core/dates';
import { D1_BATCH_STATEMENT_CAP } from '../../core/constants';
import { ClaimedUnit, claimUnit, completeUnit, failUnit } from './units';
import { writeRawRows } from './raw';
import { finalizeIfReady } from '../../reconcile';

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

  // Group by event day: window units carry candidates for many days; day units
  // carry one. Each group upserts into seed_raw under its own day.
  const byDay = new Map<string, SeedCandidate[]>();
  for (const c of candidates) {
    const d = warsawDateOf(c.startMs);
    const arr = byDay.get(d);
    if (arr) arr.push(c);
    else byDay.set(d, [c]);
  }

  let rowsWritten = 0;
  for (const [eventDay, cands] of byDay) {
    rowsWritten += await writeRawRows(env.DB, { day: eventDay, batchId: unit.batch_id, unitId: unit.id, provider: unit.provider, candidates: cands }, D1_BATCH_STATEMENT_CAP);
  }

  const ok = await completeUnit(env.DB, unit.id, unit.token, rowsWritten);
  if (!ok) throw new Error('completeUnit failed (lost lease?)');

  // Each day this unit wrote is now possibly complete → reconcile it.
  for (const eventDay of byDay.keys()) {
    await finalizeIfReady(env, eventDay, unit.batch_id);
  }
}
