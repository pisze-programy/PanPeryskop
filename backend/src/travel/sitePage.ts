import { ORIGIN_PAGES, PUBLIC_BASE } from './webpage';
import texts from './data/site-texts.json';

export type SiteLang = 'pl' | 'en';

export const SITE_LANGS: SiteLang[] = ['pl', 'en'];

interface FaqItem {
  q: string;
  a: string;
}

interface FootLink {
  label: string;
  href: string;
}

export interface SiteText {
  lang: string;
  locale: string;
  path: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  schemaDescription: string;
  official: string;
  download: string;
  menu: string;
  close: string;
  languageLabel: string;
  heroTitle: string;
  heroLead: string;
  heroAlt: string;

  faqTitle: string;
  faq: FaqItem[];
  statement: string;
  statementMarkLogo: string;
  statementMarkBall: string;
  statementMarkRun: string;
  plansCta: string;
  mosaicMap: string;
  mosaicEvents: string;
  mosaicFlight: string;
  mosaicStay: string;
  mosaicPriceLabel: string;
  mosaicCta: string;
  aboutLabel: string;
  aboutMark: string;
  howTitle: string;
  upcomingLabel: string;
  upcomingTitle: string;
  examples: string[];
  cardCity: string;
  cardConcert: string;
  cardMatch: string;
  cardRace: string;
  plans: { year: string; body: string }[];
  prev: string;
  next: string;
  pause: string;
  play: string;
  footApp: string;
  footStore: string;
  footLinks: FootLink[];
  footAirportsLabel: string;
  footRights: string;
  footAi: string;
  footSitemap: string;
}

const TEXTS = texts as Record<SiteLang, SiteText>;
const APP_STORE = 'https://apps.apple.com/pl/app/pan-peryskop/id6803138750';
const STORE_BADGE = '/assets/app-store-badge.svg';
// Lazy so this module can be imported by webpage without a top-level cycle.
function ogImage(): string {
  return `${PUBLIC_BASE}/assets/og-image.png`;
}
const HERO_IMAGE = 'https://images.unsplash.com/photo-1574060603747-421196bce3f4?w=2000&h=1250&fit=crop&auto=format&q=80';
const SLIDE_IMAGE = 'https://images.unsplash.com/photo-1577133192629-5140c5371590?w=2000&h=1250&fit=crop&auto=format&q=80';
const HERO_IMAGE_3 = 'https://images.unsplash.com/photo-1577958194277-7b3bc213b03c?w=2000&h=1250&fit=crop&auto=format&q=80';
const BAND_IMAGE = 'https://images.unsplash.com/photo-1577958194277-7b3bc213b03c?w=780&h=1690&fit=crop&auto=format&q=80';

const APPLE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

export function siteText(lang: SiteLang): SiteText {
  return TEXTS[lang];
}

export const SITE_MODULES = ['app'];

export function stylesheetLinks(): string {
  return SITE_MODULES.map((name) => `<link rel="stylesheet" href="/css/${name}.css" />`).join('\n');
}

export function renderSite(lang: SiteLang): string {
  const t = siteText(lang);
  const url = `${PUBLIC_BASE}${t.path === '/' ? '/' : t.path}`;
  const airportLabel = (origin: typeof ORIGIN_PAGES[number]) => (lang === 'pl' ? origin.genitive : origin.name);
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${url}#website`, url, name: 'Pan Peryskop', inLanguage: t.lang },
      {
        '@type': 'SoftwareApplication',
        '@id': `${url}#app`,
        name: 'Pan Peryskop',
        applicationCategory: 'EntertainmentApplication',
        operatingSystem: 'iOS',
        inLanguage: t.lang,
        url: APP_STORE,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'PLN' },
        description: t.schemaDescription,
      },
      {
        '@type': 'FAQPage',
        mainEntity: t.faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  }, null, 2).replace(/</g, '\\u003c');

  const statementHtml = t.statement
    .split(' ')
    .filter(Boolean)
    .map((word, index) => `<span class="word" style="--i:${index}">${escapeHtml(word)
      .replace('{mark}', `<span class="mark mark--logo"><img src="${escapeHtml(t.statementMarkLogo)}" alt="" /></span>`)
      .replace('{ball}', `<span class="mark mark--ball"><img src="${escapeHtml(t.statementMarkBall)}" alt="" /></span>`)
      .replace('{run}', `<span class="mark mark--run"><img src="${escapeHtml(t.statementMarkRun)}" alt="" /></span>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      }</span>`)
    .join(' ');

  const strong = (text: string) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  const leadLines = (text: string) => text
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .map((line) => `<span class="lead-line">${strong(line)}</span>`)
    .join(' ');

  const plansList = t.plans.map((item, index) => `          <li class="reveal" style="--i:${index}">
            <span class="plans-year">${escapeHtml(item.year)}</span>
            <p>${strong(item.body)}</p>
          </li>`).join('\n');

  const faq = t.faq.map((item) => `        <details>
          <summary>${escapeHtml(item.q)}</summary>
          <div class="a-body">${escapeHtml(item.a)}</div>
        </details>`).join('\n');

  const footLinks = t.footLinks
    .map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('\n        ');

  const sheetLinks = t.footLinks
    .map((link) => `<a class="sheet-link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('\n      ');

  const langSwitch = () => SITE_LANGS
    .map((code) => `<a href="${escapeHtml(siteText(code).path)}" data-lang="${escapeHtml(code)}"${code === lang ? ' aria-current="page"' : ''}>${escapeHtml(code.toUpperCase())}</a>`)
    .join('<span> / </span>');

  return `<!doctype html>
<html lang="${escapeHtml(t.lang)}">
<head>
<meta charset="utf-8" />
<meta name="msvalidate.01" content="B960379F0FB764066126C93E7C5D4086" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(t.title)}</title>
<meta name="description" content="${escapeHtml(t.description)}" />
<link rel="canonical" href="${escapeHtml(url)}" />
${SITE_LANGS.map((code) => `<link rel="alternate" hreflang="${escapeHtml(code)}" href="${escapeHtml(`${PUBLIC_BASE}${siteText(code).path}`)}" />`).join('\n')}
<link rel="icon" type="image/png" href="/icon.png" />
<meta name="theme-color" content="#ffffff" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="${escapeHtml(t.locale)}" />
<meta property="og:title" content="${escapeHtml(t.ogTitle)}" />
<meta property="og:description" content="${escapeHtml(t.ogDescription)}" />
<meta property="og:url" content="${escapeHtml(url)}" />
<meta property="og:image" content="${escapeHtml(ogImage())}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">
${schema}
</script>
<link rel="preload" href="/css/app.css" as="style" />
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/assets/fonts/instrument-serif.woff2" as="font" type="font/woff2" crossorigin />
${stylesheetLinks()}
</head>
<body>
<a class="sr-only" href="#main">${escapeHtml(t.heroTitle)}</a>

<div class="splash" aria-hidden="true">
  <img class="splash-logo" src="/icon.png" alt="" width="220" height="220" />
</div>

<div class="frame page">
  <p class="official">${escapeHtml(t.official)}</p>

  <main id="main">
    <section class="hero" id="hero">
      <header class="nav" id="nav">
        <a class="brand" href="/">
          <img src="/icon.png" alt="" width="26" height="26" />
          <span>Pan Peryskop</span>
        </a>
        <button class="btn btn-primary menu-trigger" id="menu-open" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(t.menu)}</button>
      </header>
      <div class="hero-inner">
        <h1>${escapeHtml(t.heroTitle)}</h1>
        <p class="lead">${leadLines(t.heroLead)}</p>
        <a class="store-badge" href="${escapeHtml(APP_STORE)}" rel="noopener"><img src="${STORE_BADGE}" alt="${escapeHtml(t.download)}" width="120" height="40" /></a>
      </div>
      <div class="hero-media" id="hero-media" data-examples='${escapeHtml(JSON.stringify(t.examples))}'>
        <form class="hero-control" aria-label="${escapeHtml(t.heroLead)}">
          <span class="example" id="example" aria-live="polite">${escapeHtml(t.examples[0])}</span>
        </form>
        <div class="hero-track" id="hero-track">
          <div class="hero-slide"><img draggable="false" src="/assets/card-city.webp" alt="${escapeHtml(t.cardCity)}" width="720" height="720" fetchpriority="high" decoding="async" /></div>
          <div class="hero-slide"><img draggable="false" src="/assets/card-concert.webp" alt="${escapeHtml(t.cardConcert)}" width="720" height="720" loading="lazy" decoding="async" /></div>
          <div class="hero-slide"><img draggable="false" src="/assets/card-match.webp" alt="${escapeHtml(t.cardMatch)}" width="720" height="720" loading="lazy" decoding="async" /></div>
          <div class="hero-slide"><img draggable="false" src="/assets/card-race.webp" alt="${escapeHtml(t.cardRace)}" width="720" height="720" loading="lazy" decoding="async" /></div>
        </div>
      </div>
      <div class="slider-controls">
        <button type="button" class="ctrl" data-slide-prev aria-label="${escapeHtml(t.prev)}">‹</button>
        <button type="button" class="ctrl" data-slide-pause data-label-play="${escapeHtml(t.play)}" data-label-pause="${escapeHtml(t.pause)}" aria-label="${escapeHtml(t.pause)}">II</button>
        <button type="button" class="ctrl" data-slide-next aria-label="${escapeHtml(t.next)}">›</button>
      </div>
    </section>

    <section class="about" id="about">
      <span class="label">${escapeHtml(t.aboutLabel)}</span>
      <p class="statement">${statementHtml}</p>
    </section>

    <section class="upcoming" id="plans" aria-labelledby="plans-heading">
      <div class="upcoming-inner">
        <div class="upcoming-head">
          <p class="label">${escapeHtml(t.upcomingLabel)}</p>
          <h2 id="plans-heading">${escapeHtml(t.upcomingTitle)}</h2>
          <a class="store-badge" href="${escapeHtml(APP_STORE)}" rel="noopener"><img src="${STORE_BADGE}" alt="${escapeHtml(t.download)}" width="120" height="40" /></a>
        </div>
        <ul class="plans-list">
${plansList}
        </ul>
      </div>
    </section>

    <section class="faq" id="faq">
      <h2>${escapeHtml(t.faqTitle)}</h2>
${faq}
    </section>
  </main>

  <footer class="foot">
    <nav class="foot-links">
        ${footLinks}
    </nav>
    <p class="label" style="margin-top:48px;text-align:center">${escapeHtml(t.footAirportsLabel)}</p>
    <div class="foot-airports">
${ORIGIN_PAGES.map((origin) => `      <a href="/${escapeHtml(origin.slug)}">${escapeHtml(airportLabel(origin))}</a>`).join('\n')}
    </div>
    <p class="foot-wordmark">Pan Peryskop</p>
    <div class="marks-pair">
      <span class="laurel is-mirror" aria-hidden="true"></span>
      <p>${escapeHtml(t.aboutMark)}</p>
      <span class="laurel" aria-hidden="true"></span>
    </div>
    <div class="foot-marks">
      <span><img src="/icon.png" alt="" width="26" height="26" /> ${escapeHtml(t.footApp)}</span>
      <a href="${escapeHtml(APP_STORE)}" rel="noopener">${APPLE_ICON} ${escapeHtml(t.footStore)}</a>
    </div>
    <div class="foot-meta">
      <span>${escapeHtml(t.footRights)}</span>
      <span><a href="/sitemap.xml">${escapeHtml(t.footSitemap)}</a> · <a href="/llms.txt">${escapeHtml(t.footAi)}</a> · <a href="/privacy">${escapeHtml(t.footLinks[2].label)}</a> · <a href="/terms">${escapeHtml(t.footLinks[3].label)}</a></span>
      <span class="lang" aria-label="${escapeHtml(t.languageLabel)}">${langSwitch()}</span>
    </div>
  </footer>
</div>

<div class="sheet" id="menu-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(t.menu)}" hidden>
  <div class="sheet-top">
    <span class="brand">Pan Peryskop</span>
    <button class="btn btn-quiet" id="menu-close">${escapeHtml(t.close)}</button>
  </div>
  ${sheetLinks}
  <div class="lang" aria-label="${escapeHtml(t.languageLabel)}" style="margin-top:26px">${langSwitch()}</div>
</div>

<script defer src="/js/ui.js"></script>
</body>
</html>`;
}
