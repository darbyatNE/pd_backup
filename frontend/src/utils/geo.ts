// Geographic helpers. Coordinates are [lng, lat] tuples to match the map and
// getZoneCoords() in ./pjmZones.

const EARTH_RADIUS_MILES = 3958.7613;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle (haversine) distance in miles between two [lng, lat] points.
 * There was no distance utility in the codebase before this.
 */
export function haversineMiles(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
