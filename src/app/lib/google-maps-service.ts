const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? null;

export function getGoogleMapsKey(): Promise<string | null> {
  return Promise.resolve(API_KEY && API_KEY.trim() ? API_KEY.trim() : null);
}

/**
 * Builds a Google Maps Static API URL for a single marker at the given coordinates.
 * Use this to display a map image (e.g. in an <img src="...">).
 * @see https://developers.google.com/maps/documentation/maps-static/start
 */
export function getStaticMapUrl(lat: number, lng: number, apiKey: string): string {
  if (!apiKey.trim()) return "";
  const center = `${lat},${lng}`;
  const size = "640x200";
  const zoom = "15";
  const params = new URLSearchParams({
    center,
    zoom,
    size,
    markers: center,
    key: apiKey.trim(),
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
