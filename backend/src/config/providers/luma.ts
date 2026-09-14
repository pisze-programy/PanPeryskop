export const luma = {
  api: 'https://api.luma.com/discover',
  eventWeb: 'https://lu.ma',
  limit: 50,
  // Warsaw is the only launched PL "place"; other cities come by bbox.
  placeWarsaw: 'discplace-PTcuEQVHuySJe8N',
  // ±0.3° ≈ 33 km — covers the metro incl. suburbs like Sopot for Gdańsk.
  bboxRadius: 0.3,
} as const;
