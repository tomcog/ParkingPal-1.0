const STORAGE_KEY = "parkingpal_permits";
const MAX_PERMITS = 3;

export type PermitsSync = {
  load: () => Promise<string[]>;
  save: (permits: string[]) => Promise<void>;
};

let permitsSync: PermitsSync | null = null;

export function setPermitsSync(sync: PermitsSync | null) {
  permitsSync = sync;
}

export function loadPermits(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_PERMITS);
  } catch {
    return [];
  }
}

export function savePermits(permits: string[]): void {
  const trimmed = permits
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, MAX_PERMITS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** Saves to localStorage and to Supabase when user is signed in. */
export async function savePermitsAndSync(permits: string[]): Promise<void> {
  savePermits(permits);
  if (permitsSync) await permitsSync.save(permits).catch(() => {});
}

/** Call when user signs in to overwrite localStorage with their cloud permits. */
export async function hydratePermitsFromSync(): Promise<void> {
  if (!permitsSync) return;
  const remote = await permitsSync.load().catch(() => []);
  savePermits(remote);
  window.dispatchEvent(new Event("permits-hydrated"));
}
