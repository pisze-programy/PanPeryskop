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
  images: string[];
  tile: 'collage' | 'panel';
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
  faqTitle: string;
  faq: FaqItem[];
  statement: string;
  plansCta: string;
  mosaicMap: string;
  mosaicEvents: string;
  mosaicFlight: string;
  mosaicStay: string;
  mosaicPriceLabel: string;
  mosaicCta: string;
  aboutLabel: string;
  aboutTitle: string;
  aboutBody: string;
  aboutMark: string;
  howTitle: string;
  howLead: string;
  howSteps: { title: string; body: string }[];
  upcomingLabel: string;
  upcomingTitle: string;
  upcomingLead: string;
  tilePanelTitle: string;
  tilePanelMeta: string;
  examples: string[];
  prev: string;
  next: string;
  pause: string;
  play: string;
  footApp: string;
  footFree: string;
  footStore: string;
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
const SLIDE_IMAGE = 'https://images.unsplash.com/photo-1577133192629-5140c5371590?w=2000&h=1250&fit=crop&auto=format&q=80';
const HERO_IMAGE_3 = 'https://images.unsplash.com/photo-1577958194277-7b3bc213b03c?w=2000&h=1250&fit=crop&auto=format&q=80';
const BAND_IMAGE = 'https://images.unsplash.com/photo-1577958194277-7b3bc213b03c?w=780&h=1690&fit=crop&auto=format&q=80';

const LAUREL =
  '<svg viewBox="0 0 30 76" aria-hidden="true"><path d="M22 4c-6 10-9 20-9 30 0 12 3 24 9 38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 22c-4-2-7-1-9 2 3 3 6 3 9 1z" fill="currentColor"/><path d="M12 40c-4-2-7-1-9 2 3 3 6 3 9 1z" fill="currentColor"/><path d="M13 58c-4-2-7-1-9 2 3 3 6 3 9 1z" fill="currentColor"/></svg>';

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

  const statementHtml = t.statement
    .split(' ')
    .filter(Boolean)
    .map((word, index) => `<span class="word" style="--i:${index}">${word
      .replace('{mark}', '<span class="mark" aria-hidden="true"></span>')
      .replace('{band}', '<span class="mark mark--band" aria-hidden="true"></span>')}</span>`)
    .join(' ');

  const features = t.features.map((feature) => `      <section class="feature reveal">
        <div class="feature-media">
          ${feature.tile === 'panel'
            ? `<div class="tile-panel"><span class="label">${t.tilePanelTitle}</span><strong>${t.tilePanelMeta}</strong></div>`
            : `<div class="collage">${feature.images.map((src) => `<img src="${src}" alt="${feature.alt}" width="800" height="800" loading="lazy" decoding="async" />`).join('')}</div>`}
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
    <section class="hero" id="hero">
      <h1>${t.heroTitle}</h1>
      <p class="lead">${t.heroLead}</p>
      <form class="hero-control" aria-label="${t.heroLead}">
        <span class="example" id="example" aria-live="polite">${t.examples[0]}</span>
        <div class="slider-controls">
          <button type="button" class="ctrl" data-slide-prev aria-label="${t.prev}">‹</button>
          <button type="button" class="ctrl" data-slide-pause data-label-play="${t.play}" aria-label="${t.pause}">II</button>
          <button type="button" class="ctrl" data-slide-next aria-label="${t.next}">›</button>
        </div>
      </form>
      <p class="hero-actions">
        <a class="btn btn-primary" href="${APP_STORE}" rel="noopener">${APPLE_ICON}${t.download}</a>
        <a class="link-arrow" href="/tanie-loty">${t.flightsLink}</a>
      </p>
      <div class="hero-media" id="hero-media" data-examples='${JSON.stringify(t.examples).replace(/'/g, "&#39;")}'>
        <img class="is-active" src="${HERO_IMAGE}" alt="${t.heroAlt}" width="2000" height="1250" fetchpriority="high" decoding="async" />
        <img src="${SLIDE_IMAGE}" alt="" width="2000" height="1250" loading="lazy" decoding="async" />
        <img src="${HERO_IMAGE_3}" alt="" width="2000" height="1250" loading="lazy" decoding="async" />
      </div>
      <div class="dots" role="tablist" aria-label="${t.heroTitle}">
        <button type="button" role="tab" aria-selected="true"></button>
        <button type="button" role="tab" aria-selected="false"></button>
        <button type="button" role="tab" aria-selected="false"></button>
      </div>
    </section>

    ${features}

    <section class="about" id="o-nas">
      <span class="label">${t.aboutLabel}</span>
      <h2>${t.aboutTitle}</h2>
      <p class="statement">${statementHtml}</p>
      <p class="about-body">${t.aboutBody}</p>
    </section>

    <section class="how" id="jak-to-dziala">
      <h2>${t.howTitle}</h2>
      <p class="lead">${t.howLead}</p>
      <ol>
${t.howSteps.map((step, index) => `        <li class="reveal"><span>${index + 1}</span><h3>${step.title}</h3><p>${step.body}</p></li>`).join('\n')}
      </ol>
    </section>

    <section class="upcoming dark" id="w-przygotowaniu">
      <p class="label">${t.upcomingLabel}</p>
      <h2>${t.upcomingTitle}</h2>
      <p class="lead">${t.upcomingLead}</p>
      <div class="canvas">
        <div class="mcard mcard--w1 reveal" style="--i:0">
          <h4>${t.mosaicMap}</h4>
          <div class="mmap"><i style="left:26%;top:30%"></i><i style="left:62%;top:22%"></i><i style="left:44%;top:64%"></i></div>
        </div>
        <div class="mcard mcard--w2 reveal" style="--i:1">
          <h4>${t.mosaicEvents}</h4>
          <div class="mrow"><s></s><u></u><u></u></div>
          <div class="mrow"><s></s><u></u><u></u></div>
          <div class="mrow"><s></s><u></u><u></u></div>
          <div class="mrow"><s></s><u></u><u></u></div>
        </div>
        <div class="mcard mcard--w3 reveal" style="--i:2">
          <h4>${t.mosaicFlight}</h4>
          <div class="mphoto mphoto--wide"></div>
          <p class="label">${t.mosaicPriceLabel}</p>
          <div class="mrow"><s></s><u></u></div>
          <span class="mpill">${t.mosaicCta}</span>
        </div>
        <div class="mcard mcard--w4 reveal" style="--i:3">
          <h4>${t.mosaicStay}</h4>
          <div class="mphoto mphoto--tall"></div>
          <div class="mrow"><s></s><u></u></div>
        </div>
      </div>
      <a class="btn btn-quiet" href="/tanie-loty">${t.plansCta}</a>
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
    <div class="marks-pair">
      <span class="laurel is-mirror">${LAUREL}</span>
      <p>${t.aboutMark}</p>
      <span class="laurel">${LAUREL}</span>
    </div>
    <p class="foot-wordmark">Pan Peryskop</p>
    <div class="foot-marks">
      <span><img src="/icon.png" alt="" width="26" height="26" /> ${t.footApp}</span>
      <span>${t.footFree}</span>
      <a href="${APP_STORE}" rel="noopener">${APPLE_ICON} ${t.footStore}</a>
    </div>
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
