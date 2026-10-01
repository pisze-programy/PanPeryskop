import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndexPage } from '../src/travel/webpage';
import { HUB_CSS, ORIGIN_CSS, SITE_CSS } from '../src/travel/pageStyles';
import { SITE_MODULES } from '../src/travel/sitePage';

const moduleLinks = (html: string): number => (html.match(/<link rel="stylesheet"/g) ?? []).length;

test('the hub page links the landing stylesheet modules', () => {
  const html = renderIndexPage('2026-09-30');
  for (const name of SITE_MODULES) {
    assert.match(html, new RegExp(`/css/${name}\\.css`), `${name}.css is not linked`);
  }
  assert.match(html, /\/css\/shell\.css/);
  assert.equal(moduleLinks(html), SITE_MODULES.length + 1);
  assert.match(html, /class="hub"/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /property="og:title"/);
});

test('the landing shell classes are on the hub header and footer', () => {
  const html = renderIndexPage('2026-09-30');
  assert.match(html, /<header class="nav">/);
  assert.match(html, /class="official"/);
  assert.match(html, /class="brand"/);
  assert.match(html, /menu-trigger/);
  assert.match(html, /<footer class="foot">/);
  assert.match(html, /class="foot-links"/);
  assert.match(html, /class="foot-meta"/);
});

test('the generated pages carry the linked modules, not the full inline stylesheet', () => {
  const html = renderIndexPage('2026-09-30');
  assert.doesNotMatch(html, /@font-face/, 'the fonts come from the linked tokens module');
  assert.doesNotMatch(html, /font-family:var\(--sans\)/, 'the body font comes from the linked modules');
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
