/**
 * Coordinates for a typed-in birth place, from the bundled place data
 * (utils/places.ts). No network: the app never sends a place name anywhere.
 * Profiles picked from the lists already carry coordinates; this only covers
 * a city typed by hand ("Use '…'" in the picker) or an older profile without
 * coordinates. Null when the place isn't in the data.
 */
import { findPlace } from './places';
import { countryCodeFromName } from './timezone';

export type GeoPoint = { lat: number; lng: number; tz: string };

export function geocodeCity(place: string): GeoPoint | null {
  try {
    const m = findPlace(place, countryCodeFromName);
    return m ? { lat: m.lat, lng: m.lng, tz: m.tz } : null;
  } catch {
    return null;
  }
}
