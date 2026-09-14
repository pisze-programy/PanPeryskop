export const going = {
  base: 'https://goingapp.pl',
  algoliaOrigin: 'https://goingapp.pl',
  place: (slug: string) => `https://api-empikbilety.prod.goingapp.eu/api/v1/place/${slug}`,
  poster: (path: string, sig: string) =>
    `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,h_810,w_1080/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`,
  thumb: (path: string, sig: string) =>
    `https://res.cloudinary.com/dr89d8ldb/image/upload/c_fill,w_320,h_320/f_jpg/q_auto:eco/v1/${path}?_a=${sig}`,
} as const;
