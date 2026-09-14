import { queue } from './queue';

export type TravelTag = 'citybreak' | 'pilka-nozna' | 'biegi';
export type TravelRunType = 'backfill' | 'replenish';
export type PlaceKind = 'hotel' | 'attraction' | 'car' | 'insurance';
export type HotelTier = 'economy' | 'recommended' | 'premium';

const travelTagValues: TravelTag[] = ['citybreak', 'pilka-nozna', 'biegi'];
const placeKinds: PlaceKind[] = ['hotel', 'attraction', 'car', 'insurance'];
const hotelTiers: HotelTier[] = ['economy', 'recommended', 'premium'];

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
  backfillDays: 90,
  replenishDays: 7,
  batchCap: queue.d1BatchCap,
  reachability: {
    nearbyKm: 200,
    outboundOffsets: [-3, -2, -1],
    returnOffsets: [1, 2, 3],
  },
  flights: {
    fareBase: 'https://www.ryanair.com/api/farfnd/3/oneWayFares',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    availabilityTtlMs: 24 * 3_600_000,
    priceTtlMs: 12 * 3_600_000,
    sim: {
      noFareMask: 3,
      basePriceMin: 20,
      basePriceRange: 180,
      priceSpikeRange: 25,
      hourStart: 8,
      hourRange: 11,
      fallbackPriceMin: 50,
      fallbackPriceRange: 60,
      outboundWindow: [-7, -1] as [number, number],
      returnWindow: [1, 7] as [number, number],
    },
  },
  places: {
    kinds: placeKinds,
    tiers: hotelTiers,
    linkBase: {
      hotel: 'https://www.booking.com/searchresults.html?ss=',
      attraction: 'https://www.getyourguide.com/s/?q=',
      car: 'https://www.booking.com/cars/index.html?ss=',
      insurance: 'https://www.getyourguide.com/s/?q=',
    } as Record<PlaceKind, string>,
  },
  api: {
    maxWindowMs: 370 * 24 * 3_600_000,
    maxLimit: 1000,
    iataPattern: /^[A-Z]{3}$/,
  },
} as const;
