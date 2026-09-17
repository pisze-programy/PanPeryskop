import { CONFIG } from '../config/index';

// The affiliate id is public, but the URL is built server side so the widget
// parameters change without an app release.

export type StayView = 'mini' | 'full';
export type StayTheme = 'light' | 'dark';

export interface StaysWidgetRequest {
  lat?: number;
  lng?: number;
  address?: string;
  checkin: string;
  checkout: string;
  theme: StayTheme;
  view: StayView;
  priceper?: 'nightly' | 'total';
  minstars?: number;
  minguest?: number;
}

export function staysWidgetUrl(aid: string, request: StaysWidgetRequest): string {
  const cfg = CONFIG.travel.stay22;
  const params = new URLSearchParams();
  params.set('aid', aid);
  if (request.lat !== undefined && request.lng !== undefined) {
    params.set('lat', String(request.lat));
    params.set('lng', String(request.lng));
  } else if (request.address) {
    params.set('address', request.address);
  }
  params.set('checkin', request.checkin);
  params.set('checkout', request.checkout);
  params.set('currency', cfg.currency);
  params.set('ljs', cfg.language);
  params.set('unitsystem', cfg.unitsystem);
  params.set('invmode', cfg.invmode);
  params.set('hotelsapi', cfg.hotelsapi);
  params.set('campaign', cfg.campaign);
  params.set('mapstyle', request.theme);
  params.set('limit', String(cfg.limits[request.view]));
  params.set('zoom', String(cfg.zoom[request.view]));
  params.set('viewmode', 'map');
  params.set('scroll', request.view === 'full' ? 'enabled' : 'disabled');
  if (request.priceper) params.set('priceper', request.priceper);
  if (request.minstars) params.set('minstarrating', String(request.minstars));
  if (request.minguest) params.set('minguestrating', String(request.minguest));
  for (const hide of cfg.hidden) params.set(hide, 'true');
  for (const hide of request.view === 'full' ? cfg.fullHidden : cfg.miniHidden) {
    params.set(hide, 'true');
  }
  return `${cfg.embedBase}?${params.toString()}`;
}
