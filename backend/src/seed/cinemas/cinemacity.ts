import type { Cinema } from './types';

export const CC_CINEMAS: Cinema[] = [
  { id: '1100', name: 'Biała Podlaska', city: 'Biała Podlaska', lat: 52.03441, lng: 23.12303, enabled: true },
  { id: '1088', name: 'Bielsko-Biała', city: 'Bielsko-Biała', lat: 49.8026, lng: 19.051352, enabled: true },
  { id: '1086', name: 'Bydgoszcz', city: 'Bydgoszcz', lat: 53.125305, lng: 18.01894, enabled: true },
  { id: '1092', name: 'Bytom', city: 'Bytom', lat: 50.347607, lng: 18.918924, enabled: true },
  { id: '1098', name: 'Cieszyn', city: 'Cieszyn', lat: 49.749653, lng: 18.637823, enabled: true },
  { id: '1089', name: 'Częstochowa - Galeria Jurajska', city: 'Częstochowa', lat: 50.80704, lng: 19.132248, enabled: true },
  { id: '1075', name: 'Częstochowa - Wolność', city: 'Częstochowa', lat: 50.813187, lng: 19.117859, enabled: true },
  { id: '1099', name: 'Elbląg', city: 'Elbląg', lat: 54.16652, lng: 19.4023, enabled: true },
  { id: '1085', name: 'Gliwice', city: 'Gliwice', lat: 50.300583, lng: 18.681223, enabled: true },
  { id: '1065', name: 'Katowice - Punkt 44', city: 'Katowice', lat: 50.26252, lng: 19.00602, enabled: true },
  { id: '1079', name: 'Katowice - Silesia', city: 'Katowice', lat: 50.270752, lng: 19.002821, enabled: true },
  { id: '1090', name: 'Kraków - Bonarka', city: 'Kraków', lat: 50.02694, lng: 19.94972, enabled: true },
  { id: '1076', name: 'Kraków - Galeria Kazimierz', city: 'Kraków', lat: 50.05303, lng: 19.956566, enabled: true },
  { id: '1064', name: 'Kraków - Zakopianka', city: 'Kraków', lat: 50.01654, lng: 19.930508, enabled: true },
  { id: '1094', name: 'Lublin - Felicity', city: 'Lublin', lat: 51.231422, lng: 22.613071, enabled: true },
  { id: '1084', name: 'Lublin - Plaza', city: 'Lublin', lat: 51.245033, lng: 22.550875, enabled: true },
  { id: '1080', name: 'Łódź Manufaktura', city: 'Łódź', lat: 51.780827, lng: 19.448492, enabled: true },
  { id: '1081', name: 'Poznań - Kinepolis', city: 'Poznań', lat: 52.373806, lng: 16.980959, enabled: true },
  { id: '1078', name: 'Poznań - Plaza', city: 'Poznań', lat: 52.44197, lng: 16.918924, enabled: true },
  { id: '1062', name: 'Ruda Śląska', city: 'Ruda Śląska', lat: 50.275566, lng: 18.866491, enabled: true },
  { id: '1082', name: 'Rybnik', city: 'Rybnik', lat: 50.096584, lng: 18.53775, enabled: true },
  { id: '1083', name: 'Sosnowiec', city: 'Sosnowiec', lat: 50.275215, lng: 19.126959, enabled: true },
  { id: '1095', name: 'Starogard Gdański', city: 'Starogard Gdański', lat: 53.964165, lng: 18.529493, enabled: true },
  { id: '1077', name: 'Toruń - Czerwona Droga', city: 'Toruń', lat: 53.01551, lng: 18.600689, enabled: true },
  { id: '1093', name: 'Toruń - Plaza', city: 'Toruń', lat: 53.015995, lng: 18.561178, enabled: true },
  { id: '1091', name: 'Wałbrzych', city: 'Wałbrzych', lat: 50.767063, lng: 16.265245, enabled: true },
  { id: '1074', name: 'Warszawa - Arkadia', city: 'Warszawa', lat: 52.257217, lng: 20.984465, enabled: true },
  { id: '1061', name: 'Warszawa - Bemowo', city: 'Warszawa', lat: 52.26571, lng: 20.932743, enabled: true },
  { id: '1096', name: 'Warszawa - Białołęka Galeria Północna', city: 'Warszawa', lat: 52.318344, lng: 20.964226, enabled: true },
  { id: '1069', name: 'Warszawa - Janki', city: 'Janki', lat: 52.135708, lng: 20.892134, enabled: true },
  { id: '1070', name: 'Warszawa - Mokotów', city: 'Warszawa', lat: 52.17884, lng: 21.00342, enabled: true },
  { id: '1068', name: 'Warszawa - Promenada', city: 'Warszawa', lat: 52.2316, lng: 21.106195, enabled: true },
  { id: '1060', name: 'Warszawa - Sadyba', city: 'Warszawa', lat: 52.187485, lng: 21.061102, enabled: true },
  { id: '1067', name: 'Wrocław - Korona', city: 'Wrocław', lat: 51.142323, lng: 17.08925, enabled: true },
  { id: '1097', name: 'Wrocław - Wroclavia', city: 'Wrocław', lat: 51.096714, lng: 17.034151, enabled: true },
  { id: '1087', name: 'Zielona Góra', city: 'Zielona Góra', lat: 51.936207, lng: 15.511678, enabled: true },
];

export function ccScopes(): string[] {
  return CC_CINEMAS.map((c) => c.id);
}
