import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey)
    : (null as ReturnType<typeof createClient> | null);

export function isSupabaseConfigured(): boolean {
  return !!(url && anonKey);
}

export type ParkingRow = {
  user_id: string;
  lat: number;
  lng: number;
  timestamp: number;
  timer: { type: string; label: string; endTime: number } | null;
  updated_at: string;
};
