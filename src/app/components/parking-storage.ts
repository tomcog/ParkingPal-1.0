export interface ParkingTimer {
  type: "meter" | "moveby";
  label: string;
  endTime: number;
}

export interface ParkedLocation {
  lat: number;
  lng: number;
  timestamp: number;
  timer?: ParkingTimer | null;
}

const STORAGE_KEY = "parkingpal_parked_location";

export type ParkingSync = {
  load: () => Promise<ParkedLocation | null>;
  save: (location: ParkedLocation) => Promise<void>;
  clear: () => Promise<void>;
};

let parkingSync: ParkingSync | null = null;

export function setParkingSync(sync: ParkingSync | null) {
  parkingSync = sync;
}

export function loadParkedLocation(): ParkedLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveParkedLocation(location: ParkedLocation) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
}

export function clearParkedLocation() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Saves to localStorage and to Supabase when user is signed in. */
export async function saveParkedLocationAndSync(location: ParkedLocation): Promise<void> {
  saveParkedLocation(location);
  if (parkingSync) await parkingSync.save(location).catch(() => {});
}

/** Clears localStorage and Supabase when user is signed in. */
export async function clearParkedLocationAndSync(): Promise<void> {
  clearParkedLocation();
  if (parkingSync) await parkingSync.clear().catch(() => {});
}

/** Call when user signs in to overwrite localStorage with their cloud data. */
export async function hydrateParkingFromSync(): Promise<void> {
  if (!parkingSync) return;
  const remote = await parkingSync.load().catch(() => null);
  if (remote) saveParkedLocation(remote);
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function getTimeRemaining(endTime: number): {
  total: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
} {
  const total = endTime - Date.now();
  if (total <= 0) {
    return { total: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  return {
    total,
    hours: Math.floor(total / 3600000),
    minutes: Math.floor((total % 3600000) / 60000),
    seconds: Math.floor((total % 60000) / 1000),
    expired: false,
  };
}

export function formatCountdown(endTime: number): string {
  const { hours, minutes, seconds, expired } = getTimeRemaining(endTime);
  if (expired) return "Expired";
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
