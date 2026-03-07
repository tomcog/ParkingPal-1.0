import { supabase, type ParkingRow } from "./supabase";
import type { ParkedLocation } from "../components/parking-storage";

function rowToLocation(row: ParkingRow): ParkedLocation {
  return {
    lat: row.lat,
    lng: row.lng,
    timestamp: row.timestamp,
    timer: row.timer ?? null,
  };
}

export async function fetchParkingForUser(userId: string): Promise<ParkedLocation | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("current_parking")
    .select("lat, lng, timestamp, timer")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToLocation(data as ParkingRow);
}

export async function upsertParkingForUser(
  userId: string,
  location: ParkedLocation
): Promise<void> {
  if (!supabase) return;
  await supabase.from("current_parking").upsert(
    {
      user_id: userId,
      lat: location.lat,
      lng: location.lng,
      timestamp: location.timestamp,
      timer: location.timer ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

export async function deleteParkingForUser(userId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("current_parking").delete().eq("user_id", userId);
}
