// City centers — mirror of ios/PanPeryskop/Models/City.swift (city pill).
export interface CityDef {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const CITIES: CityDef[] = [
  { id: 'poznan', name: 'Poznań', lat: 52.4064, lng: 16.9252 },
  { id: 'warszawa', name: 'Warszawa', lat: 52.2297, lng: 21.0122 },
  { id: 'gdansk', name: 'Gdańsk', lat: 54.352, lng: 18.6466 },
  { id: 'krakow', name: 'Kraków', lat: 50.0647, lng: 19.945 },
  { id: 'lodz', name: 'Łódź', lat: 51.7592, lng: 19.456 },
  { id: 'wroclaw', name: 'Wrocław', lat: 51.1079, lng: 17.0385 },
  { id: 'szczecin', name: 'Szczecin', lat: 53.4285, lng: 14.5528 },
  { id: 'bydgoszcz', name: 'Bydgoszcz', lat: 53.1235, lng: 18.0084 },
  { id: 'lublin', name: 'Lublin', lat: 51.2465, lng: 22.5684 },
  { id: 'katowice', name: 'Katowice', lat: 50.2649, lng: 19.0238 },
  { id: 'bialystok', name: 'Białystok', lat: 53.1325, lng: 23.1688 },
];

export function cityById(id: string): CityDef | undefined {
  return CITIES.find((c) => c.id === id);
}

// Approx radius (degrees) around a city center used as a filter bbox.
const CITY_RADIUS_DEG = 0.2; // ~22 km

export function cityBbox(id: string): { swLat: number; swLng: number; neLat: number; neLng: number } | null {
  const c = cityById(id);
  if (!c) return null;
  return {
    swLat: c.lat - CITY_RADIUS_DEG,
    swLng: c.lng - CITY_RADIUS_DEG,
    neLat: c.lat + CITY_RADIUS_DEG,
    neLng: c.lng + CITY_RADIUS_DEG,
  };
}

// Simple haversine distance (km).
export function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestCity(lat: number, lng: number): string {
  let best = '—';
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = distKm(lat, lng, c.lat, c.lng);
    if (d < bestD) { bestD = d; best = c.name; }
  }
  return bestD < 60 ? best : `poza miastami (${bestD.toFixed(0)}km)`; // ~60km cutoff
}
