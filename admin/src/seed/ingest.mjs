// Ingest orchestrator: iterate manifest entries, run the pure `decide`, execute
// the chosen action via an injected `io` (media + api + fs). All side effects
// live here or in io — decide/validate stay pure. Injectable so the loop itself
// can be tested with stubbed io.
import { join } from 'node:path';
import { decide } from './decide.mjs';

const log = (msg) => console.log(msg);

/**
 * io = {
 *   api:   { login, fetchSeedIds, fetchBlacklist, patchAffiliate, upload },
 *   fs:    { existsSync },
 *   media: { optimize },
 * }
 * ctx = { force, baseDir, now, ttlMs, maxLookaheadMs }
 */
export async function ingestEvents({ events, io, ctx }) {
  const session = { token: await io.api.login() };
  const rejectedIds = await io.api.fetchSeedIds('/admin/seed/rejected');
  const existingIds = ctx.force ? new Set() : await io.api.fetchSeedIds('/admin/seed/existing');
  const blacklist = await io.api.fetchBlacklist();
  if (blacklist.length) log(`blacklist: ${blacklist.length} aktywnych reguł (${ctx.baseUrl})`);

  const results = { done: [], errors: [], skipped: 0 };

  for (let i = 0; i < events.length; i++) {
    const entry = events[i];
    const label = entry.external_id || entry.title || `#${i}`;
    const d = decide(entry, { ...ctx, rejectedIds, existingIds, blacklist });

    switch (d.action) {
      case 'skip': {
        // Terminal reasons: mark done so a re-run skips them (mirrors the old
        // in-loop mutation; the manifest is written back by the caller).
        if (d.reason === 'blacklisted') {
          entry.status = 'done';
          entry.error = null;
          results.skipped += 1;
          const bl = d.rule;
          log(`⊘ ${label}: blacklisted${bl.pattern ? ` "${bl.pattern}"` : ''}${bl.partner_name ? ` / ${bl.partner_name}` : ''} — skip`);
        } else if (d.reason === 'rejected') {
          entry.status = 'done';
          entry.error = null;
          results.skipped += 1;
          log(`↷ ${label}: already rejected — skip`);
        } else {
          results.skipped += 1; // 'done'
        }
        break;
      }

      case 'existing': {
        if (d.affiliateLink) {
          try {
            await io.api.patchAffiliate(entry);
            log(`↳ ${label}: already exists — affiliate link ensured`);
          } catch (e) {
            throw new Error(`affiliate backfill: ${e.message}`);
          }
        } else {
          log(`↷ ${label}: already exists — skip`);
        }
        entry.status = 'done';
        results.skipped += 1;
        break;
      }

      case 'error': {
        entry.status = 'error';
        entry.error = d.error;
        results.errors.push({ label, error: d.error });
        console.error(`✗ ${label}: ${d.error}`);
        break;
      }

      case 'upload': {
        try {
          const mediaRel = entry.media;
          if (!mediaRel) throw new Error('missing media path');
          const src = join(ctx.baseDir, mediaRel);
          if (!io.fs.existsSync(src)) throw new Error(`media file not found: ${mediaRel}`);

          const media = io.media.optimize(src, ctx.tmpDir);
          const data = await io.api.upload(session, entry, media, d.createdAt);

          entry.status = 'done';
          entry.post_id = data.id;
          entry.error = null;

          // POST /posts already creates non-no_geo entries as APPROVED
          // (api/posts.ts defaults status to approved; upload() only sends
          // 'pending' for no_geo), so the separate approvePost call was REDUNDANT
          // — removing it halves the API calls during large backfills.
          results.done.push({ id: data.id, label, approved: !entry.no_geo });
          log(`✓ ${label} -> ${data.id} (${media.type}, created_at ${new Date(d.createdAt).toISOString()})`);
        } catch (e) {
          const msg = e.message || String(e);
          // The backend POST /posts blacklist backstop (400 "blacklisted: …")
          // means the rule list changed between our fetch and the POST —
          // terminal, not a transient error (never retry in a loop).
          entry.status = /blacklisted/i.test(msg) ? 'done' : 'error';
          entry.error = msg;
          results.errors.push({ label, error: msg });
          console.error(`✗ ${label}: ${msg}`);
        }
        break;
      }
    }
  }

  return results;
}