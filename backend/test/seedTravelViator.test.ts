import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viatorBadges, viatorDurationMinutes, viatorPickImage, viatorRank } from '../src/travel/viator';

// Shapes below are copied from a live /partner/products/search response.

test('viatorBadges: partner flags in our priority order', () => {
  assert.deepEqual(
    viatorBadges(['FREE_CANCELLATION', 'LIKELY_TO_SELL_OUT', 'SPECIAL_OFFER']),
    ['best_seller', 'free_cancellation', 'special_offer'],
  );
  assert.deepEqual(viatorBadges(undefined), []);
  assert.deepEqual(viatorBadges(['SOMETHING_NEW']), []);
});

test('viatorPickImage: prefers the cover image and the 800×600 variant', () => {
  const images = [
    {
      isCover: false,
      variants: [{ url: 'small.jpg', width: 100, height: 100 }],
    },
    {
      isCover: true,
      variants: [
        { url: 'thumb.jpg', width: 400, height: 300 },
        { url: 'large.jpg', width: 800, height: 600 },
      ],
    },
  ];
  assert.equal(viatorPickImage(images), 'large.jpg');
  assert.equal(viatorPickImage([{ variants: [{ url: 'only.jpg', width: 300, height: 200 }] }]), 'only.jpg');
  assert.equal(viatorPickImage([]), null);
});

test('viatorDurationMinutes: fixed beats variable, garbage is dropped', () => {
  assert.equal(viatorDurationMinutes({ fixedDurationInMinutes: 120 }), 120);
  assert.equal(viatorDurationMinutes({ variableDurationFromMinutes: 90, variableDurationToMinutes: 180 }), 90);
  assert.equal(viatorDurationMinutes({ fixedDurationInMinutes: 0, variableDurationFromMinutes: 45 }), 45);
  assert.equal(viatorDurationMinutes(null), null);
  assert.equal(viatorDurationMinutes({}), null);
});

test('viatorRank: best sellers first, then reviews, rating, price', () => {
  const cheap = { productCode: 'A', title: 'A', productUrl: 'u', pricing: { summary: { fromPrice: 10 } } };
  const popular = {
    productCode: 'B',
    title: 'B',
    productUrl: 'u',
    flags: ['LIKELY_TO_SELL_OUT'],
    reviews: { totalReviews: 1 },
  };
  const reviewed = {
    productCode: 'C',
    title: 'C',
    productUrl: 'u',
    reviews: { totalReviews: 106, combinedAverageRating: 4.9 },
    pricing: { summary: { fromPrice: 89 } },
  };
  const ranked = viatorRank([cheap, reviewed, popular]).map((p) => p.productCode);
  assert.deepEqual(ranked, ['B', 'C', 'A']);
});
