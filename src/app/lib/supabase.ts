import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParkingTimer } from "./parking-storage";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return !!(url && anonKey);
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url!, anonKey!)
    );
  }
  return clientPromise;
}

export type ParkingRow = {
  user_id: string;
  lat: number;
  lng: number;
  timestamp: number;
  timer: ParkingTimer | null;
  updated_at: string;
};
