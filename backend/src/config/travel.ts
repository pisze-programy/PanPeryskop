import { queue } from './queue';

export type TravelTag = 'pilka-nozna' | 'biegi';
export type TravelRunType = 'backfill' | 'replenish';
export type PlaceKind = 'attraction';

const travelTagValues: TravelTag[] = ['pilka-nozna', 'biegi'];

export const travel = {
  provider: 'espn',
  tags: {
    values: travelTagValues,
    set: new Set<TravelTag>(travelTagValues),
    espn: 'pilka-nozna' as TravelTag,
    runs: 'biegi' as TravelTag,
  },
  espn: {
    host: 'https://site.api.espn.com',
    backupHost: 'https://site.web.api.espn.com',
    limit: 1000,
    timeoutMs: 30_000,
    retries: 3,
    retryDelayMs: 5_000,
  },
  worldsmarathons: {
    provider: 'worldsmarathons',
    host: 'https://worldsmarathons.com',
    timeoutMs: 30_000,
    retries: 3,
    retryDelayMs: 5_000,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:155.0) Gecko/20100101 Firefox/155.0',
  },
  europe: {
    isoCodes: new Set<string>([
      'AL', 'AD', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
      'FR', 'GB', 'GE', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD',
      'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'SM', 'TR',
      'UA', 'VA', 'XK',
    ]),
    countryNames: new Set<string>([
      'Albania', 'Andorra', 'Austria', 'Belgium', 'Bosnia', 'Bulgaria', 'Croatia',
      'Czech Republic', 'Denmark', 'England', 'Estonia', 'Finland', 'France',
      'Georgia', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy',
      'Kosovo', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Montenegro',
      'Netherlands', 'Northern Ireland', 'Norway', 'Poland', 'Portugal', 'Romania',
      'Russia', 'San Marino', 'Scotland', 'Serbia', 'Slovakia', 'Slovenia', 'Spain',
      'Sweden', 'Switzerland', 'Turkey', 'Ukraine', 'Wales',
    ]),
  },
  timezones: {
    byCountry: {
      Albania: 'Europe/Tirane',
      Andorra: 'Europe/Andorra',
      Austria: 'Europe/Vienna',
      Belgium: 'Europe/Brussels',
      Bosnia: 'Europe/Sarajevo',
      Bulgaria: 'Europe/Sofia',
      Croatia: 'Europe/Zagreb',
      'Czech Republic': 'Europe/Prague',
      Denmark: 'Europe/Copenhagen',
      England: 'Europe/London',
      Estonia: 'Europe/Tallinn',
      Finland: 'Europe/Helsinki',
      France: 'Europe/Paris',
      Georgia: 'Asia/Tbilisi',
      Germany: 'Europe/Berlin',
      Greece: 'Europe/Athens',
      Hungary: 'Europe/Budapest',
      Iceland: 'Atlantic/Reykjavik',
      Ireland: 'Europe/Dublin',
      Italy: 'Europe/Rome',
      Kosovo: 'Europe/Belgrade',
      Latvia: 'Europe/Riga',
      Lithuania: 'Europe/Vilnius',
      Luxembourg: 'Europe/Luxembourg',
      Malta: 'Europe/Malta',
      Moldova: 'Europe/Chisinau',
      Montenegro: 'Europe/Podgorica',
      Netherlands: 'Europe/Amsterdam',
      'Northern Ireland': 'Europe/London',
      Norway: 'Europe/Oslo',
      Poland: 'Europe/Warsaw',
      Portugal: 'Europe/Lisbon',
      Romania: 'Europe/Bucharest',
      Russia: 'Europe/Moscow',
      'San Marino': 'Europe/San_Marino',
      Scotland: 'Europe/London',
      Serbia: 'Europe/Belgrade',
      Slovakia: 'Europe/Bratislava',
      Slovenia: 'Europe/Ljubljana',
      Spain: 'Europe/Madrid',
      Sweden: 'Europe/Stockholm',
      Switzerland: 'Europe/Zurich',
      Turkey: 'Europe/Istanbul',
      Ukraine: 'Europe/Kyiv',
      Wales: 'Europe/London',
    } as Record<string, string>,
    byCity: {
      'las palmas': 'Atlantic/Canary',
      'santa cruz de tenerife': 'Atlantic/Canary',
      'ponta delgada': 'Atlantic/Azores',
      'angra do heroismo': 'Atlantic/Azores',
      funchal: 'Atlantic/Madeira',
      kaliningrad: 'Europe/Kaliningrad',
    } as Record<string, string>,
  },
  backfillDays: 90,
  replenishDays: 7,
  batchCap: queue.d1BatchCap,
  reachability: {
    nearbyKm: 200,
    airportMatchKm: 1,
    outboundOffsets: [-3, -2, -1],
    returnOffsets: [1, 2, 3],
  },
  // Materialized flight schedule (route_days). The schedule is seasonal, so the
  // TTL is long. The VPS fetches it through Webshare; the Worker only reads.
  routeDays: {
    horizonDays: 90,
    ttlMs: 14 * 24 * 3_600_000,
  },
  flights: {
    fareBase: 'https://www.ryanair.com/api/farfnd/3/oneWayFares',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    availabilityTtlMs: 72 * 3_600_000,
    priceTtlMs: 24 * 3_600_000,
    timeoutMs: 3_000,
    deadlineMs: 8_000,
    failureTtlMs: 5 * 60_000,
    routeConcurrency: 2,
    routeRetries: 2,
    enrichWaitMs: 2_000,
    // Matches the shortest provider cache it is derived from (Wizzair window and
    // Ryanair prices 24 h; Ryanair availabilities 72 h).
    enrichTtlMs: 24 * 3_600_000,
    alertThrottleMs: 6 * 3_600_000,
    windows: {
      outbound: [-7, -1] as [number, number],
      return: [1, 7] as [number, number],
    },
    wizzair: {
      pageUrl: 'https://wizzair.com/en-gb',
      apiHost: 'https://be.wizzair.com',
      versionPattern: 'be\\.wizzair\\.com/(\\d+\\.\\d+\\.\\d+)/Api',
      apiVersion: '29.17.0',
      versionTtlMs: 7 * 24 * 3_600_000,
      windowTtlMs: 24 * 3_600_000,
    },
  },
  flixbus: {
    provider: 'flixbus',
    apiHost: 'https://global.api.flixbus.com',
    shopHost: 'https://shop.flixbus.pl',
    currency: 'PLN',
    locale: 'pl_PL',
    lang: 'pl',
    autocompleteTtlMs: 30 * 24 * 3_600_000,
    priceTtlMs: 6 * 3_600_000,
    failureTtlMs: 5 * 60_000,
    timeoutMs: 6_000,
    // The window the bus search covers, in days around the event.
    windowBefore: 1,
    windowAfter: 1,
    // City names resolve at these distances from the event when the exact
    // city is not a Flix node: the nearest served stop stands in.
    nearbyKm: 60,
    awin: {
      // Fill in the Awin advertiser id once FlixBus approves the program.
      advertiserId: '',
      publisherId: '3071193',
      base: 'https://www.awin1.com/cread.php',
    },
  },
  viator: {
    provider: 'viator',
    hosts: {
      production: 'https://api.viator.com/partner',
      sandbox: 'https://api.sandbox.viator.com/partner',
    },
    apiVersion: '2.0',
    // The partner API has no Polish content; English is the only usable language.
    language: 'en-US',
    currency: 'PLN',
    // Verified live: pagination.count is silently capped at 50 (count=100 → 50).
    pageSize: 50,
    // Availability window around the trip day, in days.
    windowDaysBefore: 1,
    windowDaysAfter: 1,
    cacheTtlMs: 7 * 24 * 3_600_000,
    timeoutMs: 20_000,
    retries: 2,
    retryDelayMs: 2_000,
    // Flags we surface in the UI, in badge priority order.
    badgeFlags: [
      ['best_seller', 'LIKELY_TO_SELL_OUT'],
      ['free_cancellation', 'FREE_CANCELLATION'],
      ['special_offer', 'SPECIAL_OFFER'],
      ['skip_line', 'SKIP_THE_LINE'],
      ['private', 'PRIVATE_TOUR'],
      ['new', 'NEW_ON_VIATOR'],
    ] as [string, string][],
  },
  stay22: {
    provider: 'stay22',
    embedBase: 'https://www.stay22.com/embed/gm',
    campaign: 'panperyskop-trips',
    currency: 'PLN',
    language: 'pl',
    unitsystem: 'metric',
    invmode: 'accommodation',
    hotelsapi: 'booking',
    limits: { mini: 10, full: 50 },
    // Lower zoom keeps the hotel pins inside the frame; the widget default (16)
    // shows a single building.
    zoom: { mini: 11, full: 13 },
    hidden: [
      'hidebrandlogo',
      'hidesettings',
      'hidecurrency',
      'hidelanguage',
      'hidefooter',
      'hideextmaplinking',
      'hidemappanels',
      'hideppn',
      'hidespatial',
      'hidecentermap',
      'hideshare',
      'hidenavimage',
      'showhotels',
      'disablerentals',
    ],
    // The mini map only previews prices: the app takes the taps, so every
    // interactive part of the widget goes away, including the Allez button.
    miniHidden: [
      'hideenlargemap',
      'hidesearchbar',
      'hidefilters',
      'hidecheckinout',
      'hideguestpicker',
      'hidemodeswitcher',
      'hidenavbuttons',
      'hideallezbutton',
    ],
    // The full sheet has its own header for the area and the filters, so the
    // widget keeps only the map and its markers.
    fullHidden: [
      'hideenlargemap',
      'hidesearchbar',
      'hidefilters',
      'hidepricefilter',
      'hideroomtypefilter',
      'hidecheckinout',
      'hideguestpicker',
      'hidemodeswitcher',
      'hidenavbuttons',
      'hideallezbutton',
    ],
  },
  carRental: {
    provider: 'qeeq',
    tpBase: 'https://tp.media/r',
    campaignId: '172',
    marker: '778460',
    programId: '4845',
    trs: '574753',
    siteHost: 'https://www.qeeq.com',
    dealsPath: '/car-rental-deals/',
    searchPath: '/car/search',
    locale: 'en',
    pickupTime: '10:00',
    dropoffTime: '10:00',
  },
  api: {
    maxWindowMs: 370 * 24 * 3_600_000,
    maxLimit: 1000,
    iataPattern: /^[A-Z]{3}$/,
  },
  catalogue: {
    // Bump on any breaking change to the catalogue JSON shape.
    schemaVersion: 1,
    // Oldest iOS build that can still read the current catalogue.
    minAppBuild: 36,
  },
} as const;