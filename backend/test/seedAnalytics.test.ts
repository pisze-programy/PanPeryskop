import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest } from '../src/analytics/classify';
import { buildGa4Payload } from '../src/analytics/ga4';

test('classifyRequest: maps a flight request to an anonymous event with coarse dims', () => {
  const event = classifyRequest('GET', '/travel/flights/ryanair', {
    origin: 'WAW',
    destination: 'KRK',
    eventDay: '2026-10-15',
  });
  assert.deepEqual(event, {
    name: 'flight_request',
    params: { origin: 'WAW', destination: 'KRK', eventDay: '2026-10-15' },
  });
});

test('classifyRequest: drops malformed ids and never stores the raw query', () => {
  const event = classifyRequest('GET', '/travel/flights/wizzair', {
    origin: 'warsaw-city',
    destination: 'KRK',
    eventDay: 'tomorrow',
  });
  assert.deepEqual(event?.params, { destination: 'KRK' });
});

test('classifyRequest: unmapped paths produce no event', () => {
  assert.equal(classifyRequest('GET', '/admin/secret', {}), null);
  assert.equal(classifyRequest('POST', '/travel/flights/ryanair', {}), null);
  assert.equal(classifyRequest('GET', '/', {}), null);
});

test('buildGa4Payload: carries a client_id and no user_id', () => {
  const payload = buildGa4Payload([{ name: 'bus_request', params: { fromCity: 'Poznań' } }], '123.456') as Record<string, unknown>;
  assert.equal(payload.client_id, '123.456');
  assert.equal('user_id' in payload, false);
  const events = payload.events as Array<Record<string, unknown>>;
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'bus_request');
});
