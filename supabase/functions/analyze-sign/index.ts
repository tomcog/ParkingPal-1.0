// Supabase Edge Function: analyze-sign
// Proxies parking-sign image analysis to the Gemini API using a server-side
// GEMINI_API_KEY secret. Deploy with `supabase functions deploy analyze-sign`
// and set the key with `supabase secrets set GEMINI_API_KEY=...`.

// @ts-expect-error Deno runtime import
declare const Deno: { env: { get(key: string): string | undefined }; serve: (h: (r: Request) => Response | Promise<Response>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  imageBase64?: string;
  mimeType?: string;
  permits?: string[];
  timestamp?: number;
  timeZone?: string;
};

type ParkingAnalysis = {
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
};

function formatDateParts(timestamp: number, timeZone: string) {
  const date = new Date(timestamp);
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(date);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
  const time12h = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone }).format(date),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat("en-US", { minute: "2-digit", timeZone }).format(date),
    10
  );
  const time24h = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { dayOfWeek, date: dateStr, time12h, time24h };
}

function buildPrompt(permits: string[], dt: ReturnType<typeof formatDateParts>): string {
  const permitSection =
    permits.length > 0
      ? `

CRITICAL — The user has provided their parking permits. You MUST use this when deciding canPark:
User's parking permits: ${permits.map((p) => `"${p}"`).join(", ")}.

When the sign requires a permit or allows certain permits (e.g. "Permits Exempt 2R Any time"), match the user's permits flexibly (same text, abbreviations like "2R", "1E").

STREET CLEANING / STREET SWEEPING — applies to everyone:
• No one may park during street cleaning or street sweeping hours, including permit holders, unless the sign explicitly states that permit holders may park during street cleaning (rare). Treat street sweeping as a no-exemption rule: during the sweeping window, set canPark to "no" for everyone.
• When the current time is outside the street sweeping window, the user may park if they have a matching permit. In the summary, do NOT say their permit "exempts" them from street sweeping. Say instead that it is outside street sweeping hours and their permit allows them to park here (e.g. "You can park here. Street sweeping is 10AM–12PM Friday; it's currently outside that window and your 2R permit allows you to park at this spot.").

Other permit exemptions (non–street-sweeping):
• If the sign exempts a permit from a different no-parking rule (not street cleaning/sweeping) and the user has that permit, set canPark to "yes" and userHasPermit to true. Do NOT set canPark to "no" when the sign explicitly exempts the user's permit from that rule.
• If the sign only requires a permit (no time restriction) and the user has a matching permit, set canPark to "yes" and userHasPermit to true.`
      : "";
  return `You are a parking sign analysis assistant. Analyze the parking sign(s) in this image and determine whether someone can park here RIGHT NOW.

Current date and time: ${dt.dayOfWeek}, ${dt.date} at ${dt.time12h} (${dt.time24h})

CRITICAL — Use 24-hour time for all comparisons. Current 24-hour time: ${dt.time24h}.
• 11:21 PM = 23:21 (evening). 11:21 AM = 11:21 (morning). They are different: do NOT treat 23:21 as inside a 10:00–12:00 window.
• A sign window "10AM–12PM" or "10 AM to 12 noon" means 10:00–12:00 in 24-hour. The restriction is in effect ONLY when the current 24-hour time is >= 10:00 AND < 12:00. So 11:21 is inside (cannot park); 23:21 is outside (can park if permitted).
• Before setting canPark to "no" for street sweeping, check: is ${dt.time24h} between the window start and end? If ${dt.time24h} is 23:21 and the window is 10:00–12:00, the answer is no—set canPark to "yes" if the user has a matching permit.${permitSection}

Please respond in the following JSON format ONLY (no markdown, no code fences, just raw JSON):
{
  "canPark": "yes" | "no" | "conditional",
  "summary": "A brief one-sentence summary of whether parking is allowed right now",
  "details": ["Array of specific rules/details found on the sign"],
  "restrictions": ["Array of any restrictions or conditions that apply"],
  "timeInfo": "Information about time-based restrictions relative to the current time",
  "confidence": "high" | "medium" | "low",
  "parkUntil": "HH:MM" | null,
  "parkAfter": "HH:MM" | null,
  "parkAfterLabel": "short description" | null,
  "nextRestriction": { "time": "HH:MM", "label": "short description", "day": "day name (e.g. Friday, next Friday) or null if today" } | null,
  "permitRequired": true | false,
  "userHasPermit": true | false | null,
  "permitNote": "short note about permit requirement and whether user's permits match, or null"
}

If "canPark" is "conditional", explain what conditions apply.
If the image doesn't contain a parking sign, set "canPark" to "conditional" with a summary explaining that no parking sign was detected.
Be specific about time windows, days, and any special conditions visible on the sign.

IMPORTANT — "nextRestriction" rules (orange warning for when the user must move):
• Populate "nextRestriction" when "canPark" is "yes" AND there is a known upcoming restriction that will next affect this user (street cleaning, no-parking window, meter limit, tow-away zone, etc.). Include the next occurrence even if it is hours or days away—e.g. if it is Friday 11:15 PM and street sweeping is 10AM–12PM Fridays, set nextRestriction so the user is warned they can park until Friday at 10:00 AM.
• "time": 24-hour HH:MM when the restriction starts (e.g. "10:00").
• "label": short description (e.g. "Street sweeping", "No parking zone starts").
• "day": the day when the restriction applies—e.g. "Friday", "next Friday", "Saturday"; use null only when the restriction is later today (same day as current ${dt.dayOfWeek}).
• This gives the user a clear orange warning: "You can park here until [day] at [time]" before the restriction begins. If there is no such upcoming restriction, set "nextRestriction" to null.

IMPORTANT — "parkUntil" rules:
• Only populate "parkUntil" when "canPark" is "yes".
• Set it to the 24-hour HH:MM time when the NEXT parking restriction begins — i.e. when the driver must move the car. This can be any time in the future (today or tomorrow), not limited to 4 hours.
• For example, if it is currently 6pm and signs say no parking 8am–10am weekdays, and tomorrow is a weekday, set "parkUntil" to "08:00".
• If parking is allowed with no time-based restrictions at all (e.g. unrestricted residential street), set "parkUntil" to null.
• If "canPark" is "no" or "conditional", set "parkUntil" to null.

IMPORTANT — "parkAfter" and "parkAfterLabel" rules:
• Only populate "parkAfter" and "parkAfterLabel" when "canPark" is "no".
• "parkAfter" should be set to the 24-hour HH:MM time when the current restriction ends and the driver WILL be allowed to park at this location. This is the soonest time in the future (today, tomorrow, or later) when all current restrictions are lifted.
• For example, if it is currently 9am on a Tuesday and the sign says "No Parking 8am–10am Mon–Fri", set "parkAfter" to "10:00" because the restriction lifts at 10am today.
• If the sign indicates parking is never allowed (e.g. "No Parking Any Time", fire lane, bus zone), set "parkAfter" to null and "parkAfterLabel" to null.
• "parkAfterLabel" should be a short human-readable description of what ends (e.g. "Street cleaning ends", "No parking window ends", "Tow-away zone ends").
• If "canPark" is "yes" or "conditional", set "parkAfter" and "parkAfterLabel" to null.

PERMIT rules (when user provided permits above):
• "permitRequired": true if the sign indicates a permit is required for parking (e.g. "Permit 1E only", "Resident permit required"); false otherwise.
• "userHasPermit": when permitRequired is true, set true if one of the user's permits matches what the sign allows (match by meaning or common abbreviations, e.g. "1E" matches "1E Permits Exempt"); false if none match; null when permitRequired is false.
• "permitNote": brief note e.g. "Sign requires 1E permit; you have 1E" or "Permit required; you don't have a matching permit"; null when no permit is required.
• When permitRequired is true AND userHasPermit is true (user has a matching permit), set canPark to "yes" and the summary must state that they can park with their permit.
• Street cleaning / street sweeping: During the sweeping window, set canPark to "no" for everyone (no permit exemption unless the sign explicitly says permit holders may park during street cleaning). Outside the sweeping window, if the user has a permit that the sign allows (e.g. "Permits Exempt 2R Any time"), set canPark to "yes". In the summary, do NOT say the user's permit exempts them from street sweeping; say they can park because it's outside street sweeping hours and their permit allows them at this spot.
• For other no-parking rules (not street sweeping), when the sign exempts the user's permit, set canPark to "yes" and userHasPermit to true.`;
}

function parseParkingAnalysis(raw: string): ParkingAnalysis | null {
  let json = raw.trim();
  const fence = json.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fence) json = fence[1].trim();
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || !("canPark" in parsed) || !("summary" in parsed)) {
      return null;
    }
    const nr = parsed.nextRestriction as Record<string, unknown> | null | undefined;
    return {
      canPark: parsed.canPark as ParkingAnalysis["canPark"],
      summary: String(parsed.summary ?? ""),
      details: Array.isArray(parsed.details) ? parsed.details.map(String) : [],
      restrictions: Array.isArray(parsed.restrictions) ? parsed.restrictions.map(String) : [],
      timeInfo: String(parsed.timeInfo ?? ""),
      confidence: (parsed.confidence as ParkingAnalysis["confidence"]) ?? "medium",
      parkUntil: parsed.parkUntil != null ? String(parsed.parkUntil) : null,
      parkAfter: parsed.parkAfter != null ? String(parsed.parkAfter) : null,
      parkAfterLabel: parsed.parkAfterLabel != null ? String(parsed.parkAfterLabel) : null,
      nextRestriction:
        nr && typeof nr === "object" && "time" in nr && "label" in nr
          ? {
              time: String(nr.time),
              label: String(nr.label),
              day: typeof nr.day === "string" ? (nr.day as string) : undefined,
            }
          : null,
      permitRequired: typeof parsed.permitRequired === "boolean" ? parsed.permitRequired : undefined,
      userHasPermit:
        parsed.userHasPermit === true || parsed.userHasPermit === false
          ? (parsed.userHasPermit as boolean)
          : null,
      permitNote: parsed.permitNote != null ? String(parsed.permitNote) : null,
    };
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return json({ ok: false, error: "Server is missing GEMINI_API_KEY." }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const { imageBase64, mimeType, permits, timestamp, timeZone } = body;
  if (!imageBase64 || !mimeType) {
    return json({ ok: false, error: "Missing imageBase64 or mimeType." }, 400);
  }
  if (imageBase64.length > 8_000_000) {
    return json({ ok: false, error: "Image too large." }, 413);
  }

  const ts = typeof timestamp === "number" ? timestamp : Date.now();
  const tz = typeof timeZone === "string" && timeZone ? timeZone : "UTC";
  const cleanPermits = Array.isArray(permits)
    ? permits.map((p) => String(p).trim()).filter(Boolean).slice(0, 10)
    : [];

  const dt = formatDateParts(ts, tz);
  const prompt = buildPrompt(cleanPermits, dt);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const geminiBody = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, topP: 0.95, topK: 40 },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return json({ ok: false, error: message }, 502);
  }

  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!res.ok) {
    const errBody = data as { error?: { message?: string }; message?: string } | null;
    const message = errBody?.error?.message || errBody?.message || `HTTP ${res.status}`;
    return json({ ok: false, error: message }, 502);
  }

  const candidates = (data?.candidates as Array<Record<string, unknown>> | undefined) ?? [];
  const candidate = candidates[0];
  const finishReason = candidate?.finishReason as string | undefined;
  if (finishReason && finishReason !== "STOP") {
    const map: Record<string, string> = {
      SAFETY: "Response was blocked by safety filters.",
      RECITATION: "Response was blocked (recitation).",
      MAX_TOKENS: "Response was cut off (max tokens).",
    };
    return json({ ok: false, error: map[finishReason] ?? `Model stopped: ${finishReason}` }, 502);
  }
  const content = candidate?.content as { parts?: Array<{ text?: string }> } | undefined;
  const text = content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) {
    return json({ ok: false, error: "No response from model." }, 502);
  }
  const parsed = parseParkingAnalysis(text);
  if (parsed) return json({ ok: true, data: parsed });
  return json({ ok: true, text });
});
