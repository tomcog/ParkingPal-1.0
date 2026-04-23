/**
 * Parking sign analysis, proxied through the `analyze-sign` Supabase Edge
 * Function. The GEMINI_API_KEY is held server-side as a Supabase secret and
 * never shipped to the client.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isAnalyzeConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export interface ParkingAnalysis {
  canPark: "yes" | "no" | "conditional";
  summary: string;
  details: string[];
  restrictions: string[];
  timeInfo: string;
  confidence: "high" | "medium" | "low";
  parkUntil: string | null;
  parkAfter: string | null;
  parkAfterLabel: string | null;
  nextRestriction: { time: string; label: string; day?: string | null } | null;
  permitRequired?: boolean;
  userHasPermit?: boolean | null;
  permitNote?: string | null;
}

export type AnalyzeParkingSignResult =
  | { ok: true; data: ParkingAnalysis }
  | { ok: true; text: string }
  | { ok: false; error: string };

function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  return { mimeType: match[1].trim(), base64: match[2].trim() };
}

export async function analyzeParkingSign(
  imageDataUrl: string,
  userPermits: string[] = [],
  signal?: AbortSignal
): Promise<AnalyzeParkingSignResult> {
  if (!isAnalyzeConfigured()) {
    return { ok: false, error: "Sign analysis is not configured." };
  }

  let base64: string;
  let mimeType: string;
  try {
    const parsed = dataUrlToBase64(imageDataUrl);
    base64 = parsed.base64;
    mimeType = parsed.mimeType;
  } catch {
    return { ok: false, error: "Invalid image data." };
  }

  const timeZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const body = {
    imageBase64: base64,
    mimeType,
    permits: userPermits.map((p) => p.trim()).filter(Boolean),
    timestamp: Date.now(),
    timeZone,
  };

  const url = `${SUPABASE_URL!.replace(/\/$/, "")}/functions/v1/analyze-sign`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as AnalyzeParkingSignResult | null;
    if (!res.ok) {
      const err = (payload && "error" in payload && payload.error) || `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    if (!payload) return { ok: false, error: "Empty response from analyzer." };
    return payload;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "Request canceled." };
    }
    const message = e instanceof Error ? e.message : "Request failed";
    return { ok: false, error: message };
  }
}
