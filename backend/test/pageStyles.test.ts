import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderIndexPage } from '../src/travel/webpage';
import { renderSite } from '../src/travel/sitePage';
import { HUB_CSS, ORIGIN_CSS, SITE_CSS } from '../src/travel/pageStyles';
import { SITE_MODULES } from '../src/travel/sitePage';

const moduleLinks = (html: string): number => (html.match(/<link rel="stylesheet"/g) ?? []).length;

test('the hub page links the landing stylesheet modules', () => {
  const html = renderIndexPage('2026-09-30');
  for (const name of SITE_MODULES) {
    assert.match(html, new RegExp(`/css/${name}\\.css`), `${name}.css is not linked`);
  }
  assert.doesNotMatch(html, /shell\.css/, 'generated pages carry no stylesheet of their own');
  assert.equal(moduleLinks(html), SITE_MODULES.length);
  assert.match(html, /class="hub"/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /property="og:title"/);
});

test('the hub carries the landing navigation and footer, character for character', () => {
  const html = renderIndexPage('2026-09-30');
  const landing = renderSite('pl');
  const pick = (source: string, pattern: RegExp) => ((source.match(pattern) ?? [''])[0]).replace(/\s+/g, '');
  assert.equal(pick(html, /<header class="nav"[\s\S]*?<\/header>/), pick(landing, /<header class="nav"[\s\S]*?<\/header>/));
  assert.equal(pick(html, /<footer class="foot">[\s\S]*?<\/footer>/), pick(landing, /<footer class="foot">[\s\S]*?<\/footer>/));
  assert.match(html, /class="official"/);
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
