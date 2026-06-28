// Encode / decode PostGIS Extended Well-Known Binary (EWKB) for Point geometries
// at SRID 4326 (WGS84 lat/lng). Output is the uppercase hex string Postgres /
// PostGIS accepts directly as input to a geometry / geography column.
//
// Layout (25 bytes):
//   byte  0      0x01                little-endian flag
//   bytes 1–4    0x20000001          geometry type 1 (Point) | SRID flag 0x20000000
//   bytes 5–8    SRID (uint32 LE)    4326 = 0xE6100000
//   bytes 9–16   X / longitude (float64 LE)
//   bytes 17–24  Y / latitude  (float64 LE)

export function pointToEWKB(lng: number, lat: number): string {
  const buf = new ArrayBuffer(25);
  const view = new DataView(buf);
  view.setUint8(0, 1);
  view.setUint32(1, 0x20000001, true);
  view.setUint32(5, 4326, true);
  view.setFloat64(9, lng, true);
  view.setFloat64(17, lat, true);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function ewkbToPoint(hex: string): { lng: number; lat: number } | null {
  if (!hex) return null;
  const cleaned = hex.trim();
  if (cleaned.length < 50) return null;
  const pairs = cleaned.match(/.{2}/g);
  if (!pairs) return null;
  const bytes = new Uint8Array(pairs.map(h => parseInt(h, 16)));
  if (bytes.length < 25) return null;
  const view = new DataView(bytes.buffer);
  const lng = view.getFloat64(9, true);
  const lat = view.getFloat64(17, true);
  if (isNaN(lng) || isNaN(lat)) return null;
  return { lng, lat };
}

// Supabase / PostgREST may return geometry columns either as the EWKB hex
// string (default) or as a GeoJSON-like object when the PostGIS extension is
// registered in the request path. Normalise both into the EWKB hex string the
// rest of the app stores and submits.
export function toEwkbHex(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as { type?: string; coordinates?: unknown };
    if (obj.type === 'Point' && Array.isArray(obj.coordinates)) {
      const [lng, lat] = obj.coordinates as [number, number];
      if (typeof lng === 'number' && typeof lat === 'number') {
        return pointToEWKB(lng, lat);
      }
    }
  }
  return '';
}
