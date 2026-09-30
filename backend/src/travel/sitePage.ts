// The landing page, one template for every language. Texts live in
// data/site-texts.json, the airport links come from ORIGIN_PAGES, and the Worker
// renders the page, so a copy change never touches two files again.
//
// The composition follows america.gov: a greeting hero with one big rounded
// media, four repeating feature rows, one dark band, then a footer of large
// serif links over a giant wordmark.

import { ORIGIN_PAGES, PUBLIC_BASE } from './webpage';
import texts from './data/site-texts.json';

export type SiteLang = 'pl' | 'en';

export const SITE_LANGS: SiteLang[] = ['pl', 'en'];

interface FaqItem {
  q: string;
  a: string;
}

interface Feature {
  id: string;
  label: string;
  title: string;
  body: string;
  link: string;
  href: string;
  image: string;
  alt: string;
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
  flightsLink: string;
  heroAlt: string;

  features: Feature[];
  bandTitle: string;
  bandLead: string;
  faqTitle: string;
  faq: FaqItem[];
  footTitle: string;
  cardMap: string;
  cardEvents: string;
  cardFlight: string;
  cardCta: string;
  cardPriceLabel: string;
  footLinks: FootLink[];
  footAirportsLabel: string;
  footRights: string;
  footAi: string;
  footSitemap: string;
  footPrivacy: string;
  footTerms: string;
}

const TEXTS = texts as Record<SiteLang, SiteText>;
const APP_STORE = 'https://apps.apple.com/pl/app/pan-peryskop/id6803138750';
const OG_IMAGE = `${PUBLIC_BASE}/assets/og-image.png`;
const HERO_IMAGE = 'https://images.unsplash.com/photo-1574060603747-421196bce3f4?w=2000&h=1250&fit=crop&auto=format&q=80';
const BAND_IMAGE = 'https://images.unsplash.com/photo-1577958194277-7b3bc213b03c?w=780&h=1690&fit=crop&auto=format&q=80';

const APPLE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>';

export function siteText(lang: SiteLang): SiteText {
  return TEXTS[lang];
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
  }, null, 2);

  const features = t.features.map((feature) => `      <section class="feature reveal"${feature.id === 'jak-to-dziala' ? ' id="jak-to-dziala"' : ''}>
        <div class="feature-media">
          <img src="${feature.image}" alt="${feature.alt}" width="1600" height="1200" loading="lazy" decoding="async" />
        </div>
        <div>
          <span class="label">${feature.label}</span>
          <h3>${feature.title}</h3>
          <p class="muted">${feature.body}</p>
          <a class="link-arrow" href="${feature.href}"${feature.href.startsWith('http') ? ' rel="noopener"' : ''}>${feature.link}</a>
        </div>
      </section>`).join('\n');

  const faq = t.faq.map((item) => `        <details>
          <summary>${item.q}</summary>
          <div class="a-body">${item.a}</div>
        </details>`).join('\n');

  const footLinks = t.footLinks
    .map((link) => `<a href="${link.href}">${link.label}</a>`)
    .join('\n        ');

  const sheetLinks = t.footLinks
    .map((link) => `<a class="sheet-link" href="${link.href}">${link.label}</a>`)
    .join('\n      ');

  const langSwitch = () => SITE_LANGS
    .map((code) => `<a href="${siteText(code).path}" data-lang="${code}"${code === lang ? ' aria-current="page"' : ''}>${code.toUpperCase()}</a>`)
    .join('<span> / </span>');

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8" />
<meta name="msvalidate.01" content="B960379F0FB764066126C93E7C5D4086" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t.title}</title>
<meta name="description" content="${t.description}" />
<link rel="canonical" href="${url}" />
${SITE_LANGS.map((code) => `<link rel="alternate" hreflang="${code}" href="${PUBLIC_BASE}${siteText(code).path}" />`).join('\n')}
<link rel="icon" type="image/png" href="/icon.png" />
<meta name="theme-color" content="#eff1f4" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="${t.locale}" />
<meta property="og:title" content="${t.ogTitle}" />
<meta property="og:description" content="${t.ogDescription}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${OG_IMAGE}" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">
${schema}
</script>
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/assets/fonts/instrument-serif.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/site.css" />
</head>
<body>
<a class="sr-only" href="#main">${t.heroTitle}</a>

<div class="frame">
  <p class="official">${t.official}</p>

  <header class="nav" id="nav">
    <a class="brand" href="/">
      <img src="/icon.png" alt="" width="26" height="26" />
      <span>Pan Peryskop</span>
    </a>
    <div class="nav-actions">
      <a class="btn btn-primary" href="${APP_STORE}" rel="noopener">${t.download}</a>
      <button class="btn btn-quiet menu-trigger" id="menu-open" aria-haspopup="dialog" aria-expanded="false">
        ${t.menu}
      </button>
    </div>
  </header>

  <main id="main">
    <section class="hero">
      <h1>${t.heroTitle}</h1>
      <p class="lead">${t.heroLead}</p>
      <div class="hero-control">
        <a class="btn btn-primary" href="${APP_STORE}" rel="noopener">${APPLE_ICON}${t.download}</a>
        <a class="link-arrow" href="/tanie-loty">${t.flightsLink}</a>
      </div>
      <div class="hero-media">
        <img src="${HERO_IMAGE}" alt="${t.heroAlt}" width="2000" height="1250" fetchpriority="high" decoding="async" />
      </div>
    </section>

${features}

    <section class="band-dark dark">
      <h2 class="display">${t.bandTitle}</h2>
      <p class="lead">${t.bandLead}</p>
      <a class="btn btn-quiet" href="${APP_STORE}" rel="noopener">${APPLE_ICON}${t.download}</a>
      <div class="band-cards">
        <div class="bcard">
          <h4>${t.cardMap}</h4>
          <div class="bmap">
            <i style="left:24%;top:32%"></i><i style="left:58%;top:20%"></i>
            <i style="left:42%;top:64%"></i><i style="left:74%;top:52%"></i>
          </div>
        </div>
        <div class="bcard bcard--tall">
          <h4>${t.cardEvents}</h4>
          <div class="brow"><s></s><u></u><u></u></div>
          <div class="brow"><s></s><u></u><u></u></div>
          <div class="brow"><s></s><u></u><u></u></div>
          <div class="brow"><s></s><u></u><u></u></div>
        </div>
        <div class="bcard">
          <h4>${t.cardFlight}</h4>
          <div class="brow"><s></s><u></u></div>
          <div class="brow"><s></s><u></u></div>
          <p class="label">${t.cardPriceLabel}</p>
          <span class="bpill">${t.cardCta}</span>
        </div>
      </div>
    </section>

    <section class="faq" id="faq">
      <h2>${t.faqTitle}</h2>
${faq}
    </section>
  </main>

  <footer class="foot">
    <nav class="foot-links">
        ${footLinks}
    </nav>
    <p class="label" style="margin-top:48px;text-align:center">${t.footAirportsLabel}</p>
    <div class="foot-airports">
${ORIGIN_PAGES.map((origin) => `      <a href="/${origin.slug}">${airportLabel(origin)}</a>`).join('\n')}
    </div>
    <p class="foot-wordmark">Pan Peryskop</p>
    <div class="foot-meta">
      <span>${t.footRights}</span>
      <span><a href="/sitemap.xml">${t.footSitemap}</a> · <a href="/llms.txt">${t.footAi}</a> · <a href="/privacy">${t.footLinks[2].label}</a> · <a href="/terms">${t.footLinks[3].label}</a></span>
      <span class="lang" aria-label="${t.languageLabel}">${langSwitch()}</span>
    </div>
  </footer>
</div>

<div class="sheet" id="menu-sheet" role="dialog" aria-modal="true" aria-label="${t.menu}" hidden>
  <div class="sheet-top">
    <span class="brand">Pan Peryskop</span>
    <button class="btn btn-quiet" id="menu-close">${t.close}</button>
  </div>
  ${sheetLinks}
  <div class="lang" aria-label="${t.languageLabel}" style="margin-top:26px">${langSwitch()}</div>
</div>

<script defer src="/js/ui.js"></script>
</body>
</html>`;
}
