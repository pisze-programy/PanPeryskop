import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_LANGS, renderSite, siteText, type SiteLang } from '../src/travel/sitePage';
import { ORIGIN_PAGES } from '../src/travel/webpage';

test('both languages come from one texts file', () => {
  const keys = (lang: SiteLang) => Object.keys(siteText(lang)).sort();
  assert.deepEqual(keys('pl'), keys('en'), 'a key missing in one language renders as undefined');
});

test('a rendered page carries no undefined', () => {
  for (const lang of SITE_LANGS) {
    const html = renderSite(lang);
    assert.doesNotMatch(html, /undefined/, `${lang} leaks a value the texts file does not have`);
    assert.ok(html.includes(`<html lang="${lang}">`));
    assert.ok(html.includes('rel="canonical"'));
    assert.ok(html.includes('hreflang="pl"'));
    assert.ok(html.includes('hreflang="en"'));
    assert.ok(html.includes('"@type": "FAQPage"'));
  }
});

test('the language switcher marks the page it is on', () => {
  assert.match(renderSite('pl'), /href="\/" data-lang="pl" aria-current="page"/);
  assert.match(renderSite('en'), /href="\/en" data-lang="en" aria-current="page"/);
});

test('the airport links come from the origin data', () => {
  const pl = renderSite('pl');
  const en = renderSite('en');
  for (const origin of ORIGIN_PAGES) {
    assert.ok(pl.includes(`href="/${origin.slug}"`), `${origin.slug} is missing`);
    assert.ok(pl.includes(`>${origin.genitive}</a>`), `the Polish label is missing for ${origin.slug}`);
    assert.ok(en.includes(`>${origin.name}</a>`), `the English label is missing for ${origin.slug}`);
  }
});

test('the schema repeats every visible question', () => {
  const html = renderSite('pl');
  for (const item of siteText('pl').faq) {
    assert.ok(html.includes(item.q), `${item.q} is in the FAQ but not in the schema`);
  }
});
