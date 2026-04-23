const DEV_MODE_KEY = "parkingpal:dev_mode";

export function isDevMode(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(DEV_MODE_KEY) === "true";
}

export function setDevMode(enabled: boolean): void {
  localStorage.setItem(DEV_MODE_KEY, String(enabled));
}

const SIMULATED_LOCATION = { lat: 34.09, lng: -118.3617 };

export function getLocation(): Promise<{ lat: number; lng: number }> {
  if (isDevMode()) {
    return Promise.resolve({ ...SIMULATED_LOCATION });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) reject(new Error("Location access denied. Enable location permissions."));
        else if (err.code === 2) reject(new Error("Location unavailable. Try again."));
        else if (err.code === 3) reject(new Error("Location request timed out."));
        else reject(new Error("Could not get your location."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
