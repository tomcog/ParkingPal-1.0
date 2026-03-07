import { supabase } from "./supabase";

const isDev = import.meta.env.DEV;

function logPermitsError(op: "fetch" | "upsert", err: unknown) {
  if (!isDev) return;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(
    `[ParkingPal] Permits ${op} failed. If permits don't sync across devices, run supabase-schema.sql in Supabase SQL Editor.`,
    msg
  );
}

export async function fetchPermitsForUser(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("user_permits")
    .select("permits")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    logPermitsError("fetch", error);
    return [];
  }
  if (!data?.permits || !Array.isArray(data.permits)) return [];
  return (data.permits as unknown[])
    .filter((x): x is string => typeof x === "string")
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function upsertPermitsForUser(
  userId: string,
  permits: string[]
): Promise<void> {
  if (!supabase) return;
  const trimmed = permits
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 3);
  const { error } = await supabase.from("user_permits").upsert(
    {
      user_id: userId,
      permits: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) logPermitsError("upsert", error);
}
