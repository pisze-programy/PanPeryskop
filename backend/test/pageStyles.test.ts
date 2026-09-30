import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndexPage } from '../src/travel/webpage';
import { HUB_CSS, ORIGIN_CSS, SITE_CSS } from '../src/travel/pageStyles';

test('the hub page carries the shared styles', () => {
  const html = renderIndexPage('2026-09-30');
  assert.match(html, /--ink:#000c1f/);
  assert.match(html, /font-family:var\(--sans\)/);
  assert.match(html, /assets\/fonts\/inter-latin\.woff2/);
  assert.match(html, /class="hub"/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /property="og:title"/);
});

test('no attribute ends early on a quote inside it', () => {
  const html = renderIndexPage('2026-09-30');
  assert.doesNotMatch(
    html,
    />"[^<]*"/,
    'a quote inside an attribute ends it, and the page loses every style after that point'
  );
});

test('the styles survive the template literal they live in', () => {
  for (const css of [SITE_CSS, ORIGIN_CSS, HUB_CSS]) {
    assert.doesNotMatch(css, /\$\{/);
    assert.doesNotMatch(css, /`/);
  }
});
