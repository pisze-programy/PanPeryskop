// The landing page, one template for every language. Texts live in
// data/site-texts.json, the flight links come from ORIGIN_PAGES, and the Worker
// renders the page, so a copy change never touches two files again.

import { ORIGIN_PAGES, PUBLIC_BASE } from './webpage';
import texts from './data/site-texts.json';

export type SiteLang = 'pl' | 'en';

export const SITE_LANGS: SiteLang[] = ['pl', 'en'];

interface FaqItem {
  q: string;
  a: string;
}

interface Step {
  title: string;
  body: string;
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
  download: string;
  skip: string;
  menuLabel: string;
  menuOpen: string;
  languageLabel: string;
  heroPill: string;
  heroLine: string;
  heroRotator: string[];
  heroSub: string[];
  brandSub: string[];
  badges: string[];
  steps: Step[];
  faqTitle: string;
  faq: FaqItem[];
  statement: string[];
  flightsTitle: string;
  flightsLead: string;
  flightsLabel: string;
  flightsAll: string;
  flightFrom: string;
  footerLegalLabel: string;
  footerPrivacy: string;
  footerTerms: string;
  footerSupport: string;
  footerFlightsLabel: string;
  footerFlightsAll: string;
  footerEventsLabel: string;
  footerEventsLink: string;
  footerSitemap: string;
  footerAi: string;
  footerRights: string;
}

const TEXTS = texts as Record<SiteLang, SiteText>;
const APP_STORE = 'https://apps.apple.com/pl/app/pan-peryskop/id6803138750';
const OG_IMAGE = `${PUBLIC_BASE}/assets/og-image.png`;

const MARQUEE = [
  ['Poznań', 'Warszawa', 'Kraków', 'Gdańsk', 'Wrocław', 'Łódź', 'Katowice'],
  ['Szczecin', 'Bydgoszcz', 'Lublin', 'Białystok', 'Gdynia', 'Sopot', 'Toruń'],
  ['Rzeszów', 'Kielce', 'Olsztyn', 'Częstochowa', 'Bielsko-Biała', 'Koszalin', 'Zielona Góra'],
];

const MARQUEE_SPEEDS = ['', 'slow reverse', 'slower'];

const APPLE_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>';

export function siteText(lang: SiteLang): SiteText {
  return TEXTS[lang];
}

/** The landing for one language. */
export function renderSite(lang: SiteLang): string {
  const t = siteText(lang);
  const other: SiteLang = lang === 'pl' ? 'en' : 'pl';
  const url = `${PUBLIC_BASE}${t.path === '/' ? '/' : t.path}`;
  const flightFrom = (origin: typeof ORIGIN_PAGES[number]) =>
    lang === 'pl' ? `${t.flightFrom} ${origin.genitive}` : `${t.flightFrom} ${origin.name}`;
  const flightLinks = ORIGIN_PAGES
    .map((origin) => `<li><a href="/${origin.slug}">${flightFrom(origin)}</a></li>`)
    .join('\n      ');
  const footerFlights = ORIGIN_PAGES
    .map((origin) => `<a href="/${origin.slug}">${lang === 'pl' ? origin.genitive : origin.name}</a>`)
    .join('\n      ');
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

  const marquee = MARQUEE.map((cities, index) => {
    const row = cities.map((city, position) => `${position === 0 ? '<span class="hl">' : '<span>'}${city}</span>${position < cities.length - 1 ? '<span>·</span>' : ''}`).join('');
    return `      <div class="marquee">
        <div class="marquee-track ${MARQUEE_SPEEDS[index]}" aria-hidden="true">
          ${row}
          ${row}
        </div>
      </div>`;
  }).join('\n');

  const steps = t.steps.map((step, index) => `        <div class="step-item">
          <span class="num">0${index + 1}</span>
          <h4>${step.title}</h4>
          <p>${step.body}</p>
        </div>`).join('\n');

  const faq = t.faq.map((item) => `        <details class="accordion">
          <summary>${item.q} <span class="plus">+</span></summary>
          <div class="a-body">${item.a}</div>
        </details>`).join('\n');

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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/css/design.css" />
<link rel="stylesheet" href="/css/ui.css" />
<link rel="stylesheet" href="/css/animations.css" />
<link rel="stylesheet" href="/css/hero.css" />
<link rel="stylesheet" href="/css/sections.css" />
</head>
<body>

<a class="skip" href="#main">${t.skip}</a>

<header class="nav" id="nav">
  <div class="container nav-inner">
    <a class="brand" href="/">
      <img src="/icon.png" alt="" width="30" height="30" />
      <span>Pan<span class="grad-text">Peryskop</span></span>
    </a>
    <nav class="nav-links" id="nav-links" aria-label="${t.menuLabel}">
      <a href="#map">${lang === 'pl' ? 'Mapa' : 'Map'}</a>
      <a href="#jak-to-dziala">${lang === 'pl' ? 'Jak to działa' : 'How it works'}</a>
      <a href="/tanie-loty">${lang === 'pl' ? 'Tanie loty' : 'Cheap flights'}</a>
      <a href="#faq">FAQ</a>
    </nav>
    <div class="nav-actions">
      <div class="lang" aria-label="${t.languageLabel}">
        <a href="/" data-lang="pl"${lang === 'pl' ? ' aria-current="page" class="is-active"' : ''}>PL</a>
        <span>/</span>
        <a href="/en" data-lang="en"${lang === 'en' ? ' aria-current="page" class="is-active"' : ''}>EN</a>
      </div>
      <a class="btn btn-sm btn-white" href="#start">${lang === 'pl' ? 'Pobierz' : 'Download'}</a>
      <button class="nav-burger" id="nav-burger" aria-label="${t.menuOpen}" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<main id="main">

  <section class="hero dark" id="map">
    <div class="hero-content container">
      <span class="pill">${t.heroPill}</span>
      <h1 class="display display-lg">${t.heroLine}<br />
        <span class="rotator">
${t.heroRotator.map((word) => `          <span class="w grad-text">${word}</span>`).join('\n')}
        </span>
      </h1>
      <p class="sub">
        ${t.heroSub[0]}<br />
        ${t.heroSub[1]}
      </p>
      <div class="hero-cta">
        <a class="btn btn-lg btn-white" href="${APP_STORE}" rel="noopener">
          ${APPLE_ICON}
          ${t.download}
        </a>
      </div>
    </div>

    <div class="phone-rack container">
      <div class="phone-item a">
        <div class="iphone">
          <span class="side-btn" aria-hidden="true"></span>
          <div class="iphone-screen">
            <video class="ph-video" src="/assets/hero-a.mp4" muted autoplay loop playsinline preload="auto"></video>
            <span class="story-home" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div class="phone-item b">
        <div class="iphone">
          <span class="side-btn" aria-hidden="true"></span>
          <div class="iphone-screen">
            <video class="ph-video" src="/assets/hero-b.mp4" muted autoplay loop playsinline preload="auto"></video>
            <span class="story-home" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="marquee-band section" aria-label="${lang === 'pl' ? 'Miasta' : 'Cities'}">
    <div class="container">
${marquee}
    </div>
  </section>

  <section class="section brand" id="brand">
    <div class="container brand-inner">
      <div class="brand-logo">
        <img src="/assets/logo.png" alt="${lang === 'pl' ? 'Logo Pan Peryskop' : 'Pan Peryskop logo'}" width="120" height="120" />
      </div>
      <h2 class="display display-md grad-text">Pan Peryskop</h2>
      <p class="sub">${t.brandSub[0]}<br />${t.brandSub[1]}</p>
    </div>
  </section>

  <section class="section" id="jak-to-dziala">
    <div class="container">
      <div class="brand-badges">
${t.badges.map((badge) => `        <span class="pill">${badge}</span>`).join('\n')}
      </div>
      <div class="steps-grid stagger">
${steps}
      </div>
    </div>
  </section>

  <section class="section" id="faq">
    <div class="container">
      <div class="sec-head reveal">
        <span class="pill">FAQ</span>
        <h2 class="display display-md">${t.faqTitle}</h2>
      </div>
      <div class="faq-wrap stagger">
${faq}
      </div>
    </div>
  </section>

  <section class="statement dark" id="start">
    <div class="container statement-inner">
      <span class="display display-xl reveal"><span class="grad-text">${t.statement[0]}</span><br /><span class="grad-text">${t.statement[1]}</span></span>
      <div class="reveal">
        <a class="btn btn-lg btn-white" href="${APP_STORE}" rel="noopener">
          ${APPLE_ICON}
          ${t.download}
        </a>
      </div>
    </div>
  </section>

  <section class="section" id="tanie-loty-section" aria-labelledby="tanie-loty-title">
    <div class="container">
      <h2 id="tanie-loty-title">${t.flightsTitle}</h2>
      <p>${t.flightsLead}</p>
      <p>${t.flightsLabel}</p>
      <ul>
      ${flightLinks}
      </ul>
      <p><a href="/tanie-loty">${t.flightsAll}</a></p>
    </div>
  </section>

</main>

<footer class="footer dark">
  <div class="container footer-row">
    <span class="brand">
      <img src="/icon.png" alt="" width="26" height="26" />
      <span>Pan<span class="grad-text">Peryskop</span></span>
    </span>
    <nav class="footer-legal" aria-label="${t.footerLegalLabel}">
      <a href="/privacy">${t.footerPrivacy}</a>
      <a href="/terms">${t.footerTerms}</a>
      <a href="/support">${t.footerSupport}</a>
    </nav>
    <nav class="footer-legal" aria-label="${t.footerFlightsLabel}">
      <span class="footer-label">${t.footerFlightsLabel}</span>
      <a href="/tanie-loty">${t.footerFlightsAll}</a>
      ${footerFlights}
    </nav>
    <nav class="footer-legal" aria-label="${t.footerEventsLabel}">
      <span class="footer-label">${t.footerEventsLabel}</span>
      <a href="/tanie-loty">${t.footerEventsLink}</a>
    </nav>
    <nav class="footer-legal" aria-label="Info">
      <a href="/sitemap.xml">${t.footerSitemap}</a>
      <a href="/llms.txt">${t.footerAi}</a>
    </nav>
    <div class="footer-meta">
      <span>${t.footerRights}</span>
      <div class="lang">
        <a href="/" data-lang="pl"${lang === 'pl' ? ' aria-current="page" class="is-active"' : ''}>PL</a>
        <span>/</span>
        <a href="/en" data-lang="en"${lang === 'en' ? ' aria-current="page" class="is-active"' : ''}>EN</a>
      </div>
    </div>
  </div>
</footer>

<script defer src="/js/ui.js"></script>
</body>
</html>`;
}
