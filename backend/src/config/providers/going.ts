export const going = {
  base: 'https://goingapp.pl',
  algoliaOrigin: 'https://goingapp.pl',
  place: (slug: string) => `https://api-empikbilety.prod.goingapp.eu/api/v1/place/${slug}`,
  poster: (path: string, sig: string) =>
    `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,h_810,w_1080/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`,
  // Same 4:3 crop as the poster, so the preview does not change when the full
  // image loads (a square thumb crops differently and the story jumps).
  thumb: (path: string, sig: string) =>
    `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,w_320,h_240/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`,
} as const;
