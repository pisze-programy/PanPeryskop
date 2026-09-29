import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckoutEvent } from '../src/analytics/meta';
import type { CheckoutReport } from '../src/analytics/meta';

interface SentEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: string;
  user_data: { anon_id: string; client_ip_address: string; client_user_agent: string };
  app_data: { advertiser_tracking_enabled: number; extinfo: string[] };
  custom_data: { content_type: string; content_ids: string[]; content_name: string; content_category: string };
}

function report(overrides: Partial<CheckoutReport> = {}): CheckoutReport {
  return {
    eventId: 'event-1234',
    kind: 'flight',
    contentId: 'WAW-CRL',
    label: 'Ryanair',
    anonId: 'anon-1234',
    trackingEnabled: 1,
    extinfo: Array.from({ length: 16 }, (_, index) => String(index)),
    ...overrides,
  };
}

function sent(input: CheckoutReport, ip = '', agent = '', now = 0): SentEvent {
  return buildCheckoutEvent(input, ip, agent, now) as unknown as SentEvent;
}

test('buildCheckoutEvent: an app event carries the required app_data', () => {
  const event = sent(report(), '203.0.113.7', 'PanPeryskop/108', 1790640000000);
  assert.equal(event.event_name, 'InitiateCheckout');
  assert.equal(event.action_source, 'app');
  assert.equal(event.event_id, 'event-1234');
  assert.equal(event.event_time, 1790640000);
  assert.equal(event.user_data.anon_id, 'anon-1234');
  assert.equal(event.user_data.client_ip_address, '203.0.113.7');
  assert.equal(event.user_data.client_user_agent, 'PanPeryskop/108');
  assert.equal(event.app_data.advertiser_tracking_enabled, 1);
  assert.equal(event.app_data.extinfo.length, 16);
});

test('buildCheckoutEvent: a referral tap is not a checkout', () => {
  for (const kind of ['banner', 'partner']) {
    const event = sent(report({ kind }));
    assert.equal(event.event_name, 'PartnerReferral');
    assert.equal(event.custom_data.content_category, 'referral');
  }
});

test('buildCheckoutEvent: a booking keeps its own content id', () => {
  const event = sent(report({ kind: 'stay', contentId: 'booking.com' }));
  assert.equal(event.event_name, 'InitiateCheckout');
  assert.deepEqual(event.custom_data.content_ids, ['booking.com']);
  assert.equal(event.custom_data.content_name, 'Ryanair');
  assert.equal(event.custom_data.content_category, 'booking');
});

test('buildCheckoutEvent: a denied advertiser tracking stays 0', () => {
  assert.equal(sent(report({ trackingEnabled: 0 })).app_data.advertiser_tracking_enabled, 0);
});
