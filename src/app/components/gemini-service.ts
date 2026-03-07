/**
 * Gemini integration for parking sign image analysis.
 *
 * For better results and more options, see:
 * - Prompting: https://ai.google.dev/gemini-api/docs/prompting-strategies
 * - Text generation (temperature, tokens): https://ai.google.dev/gemini-api/docs/text-generation
 * - Vision / images: https://ai.google.dev/gemini-api/docs/vision
 * - Structured output (JSON): https://ai.google.dev/gemini-api/docs/structured-output
 * - Safety: https://ai.google.dev/gemini-api/docs/safety-settings
 */
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? null;

// Build prompt with current date/time and optional user permits.
// See https://ai.google.dev/gemini-api/docs/prompting-strategies
function getParkingSignPrompt(permits: string[]): string {
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
  const date = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const time12h = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const hours24 = now.getHours();
  const mins = now.getMinutes();
  const time24h = `${String(hours24).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  const time = `${time12h} (${time24h})`;
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

Current date and time: ${dayOfWeek}, ${date} at ${time}

CRITICAL — Use 24-hour time for all comparisons. Current 24-hour time: ${time24h}.
• 11:21 PM = 23:21 (evening). 11:21 AM = 11:21 (morning). They are different: do NOT treat 23:21 as inside a 10:00–12:00 window.
• A sign window "10AM–12PM" or "10 AM to 12 noon" means 10:00–12:00 in 24-hour. The restriction is in effect ONLY when the current 24-hour time is >= 10:00 AND < 12:00. So 11:21 is inside (cannot park); 23:21 is outside (can park if permitted).
• Before setting canPark to "no" for street sweeping, check: is ${time24h} between the window start and end? If ${time24h} is 23:21 and the window is 10:00–12:00, the answer is no—set canPark to "yes" if the user has a matching permit.${permitSection}

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
• "day": the day when the restriction applies—e.g. "Friday", "next Friday", "Saturday"; use null only when the restriction is later today (same day as current ${dayOfWeek}).
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

export function getGeminiKey(): string | null {
  const key = GEMINI_KEY?.trim();
  return key ? key : null;
}

/**
 * Extract raw base64 from a data URL (e.g. from canvas or file read).
 */
function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  return { mimeType: match[1].trim(), base64: match[2].trim() };
}

/** Parsed parking analysis from Gemini (matches the prompt's JSON schema). */
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

/** Extract JSON from model response (may be wrapped in markdown code fences). */
function parseParkingAnalysis(raw: string): ParkingAnalysis | null {
  let json = raw.trim();
  const codeBlock = /^```(?:json)?\s*([\s\S]*?)```$/;
  const match = json.match(codeBlock);
  if (match) json = match[1].trim();
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object" && "canPark" in parsed && "summary" in parsed) {
      const p = parsed as Record<string, unknown>;
      return {
        canPark: p.canPark as ParkingAnalysis["canPark"],
        summary: String(p.summary ?? ""),
        details: Array.isArray(p.details) ? p.details.map(String) : [],
        restrictions: Array.isArray(p.restrictions) ? p.restrictions.map(String) : [],
        timeInfo: String(p.timeInfo ?? ""),
        confidence: (p.confidence as ParkingAnalysis["confidence"]) ?? "medium",
        parkUntil: p.parkUntil != null ? String(p.parkUntil) : null,
        parkAfter: p.parkAfter != null ? String(p.parkAfter) : null,
        parkAfterLabel: p.parkAfterLabel != null ? String(p.parkAfterLabel) : null,
        nextRestriction:
          p.nextRestriction != null &&
          typeof p.nextRestriction === "object" &&
          "time" in p.nextRestriction &&
          "label" in p.nextRestriction
            ? {
                time: String((p.nextRestriction as Record<string, unknown>).time),
                label: String((p.nextRestriction as Record<string, unknown>).label),
                day: typeof (p.nextRestriction as Record<string, unknown>).day === "string" ? (p.nextRestriction as Record<string, unknown>).day as string : undefined,
              }
            : null,
        permitRequired: typeof p.permitRequired === "boolean" ? p.permitRequired : undefined,
        userHasPermit: p.userHasPermit === true || p.userHasPermit === false ? p.userHasPermit : null,
        permitNote: p.permitNote != null ? String(p.permitNote) : null,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Send the parking sign image to Gemini and return the extracted rules text.
 */
export async function analyzeParkingSign(
  imageDataUrl: string,
  userPermits: string[] = []
): Promise<AnalyzeParkingSignResult> {
  const key = getGeminiKey();
  if (!key) {
    return { ok: false, error: "Gemini API key not configured." };
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

  const permits = userPermits.map((p) => p.trim()).filter(Boolean);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
          { text: getParkingSignPrompt(permits) },
        ],
      },
    ],
    // Generation config for factual, consistent extraction (see Gemini text-generation docs)
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      topP: 0.95,
      topK: 40,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      const message =
        data?.error?.message || data?.message || `HTTP ${res.status}`;
      return { ok: false, error: message };
    }

    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      const reasonMessages: Record<string, string> = {
        SAFETY: "Response was blocked by safety filters.",
        RECITATION: "Response was blocked (recitation).",
        MAX_TOKENS: "Response was cut off (max tokens).",
      };
      return {
        ok: false,
        error: reasonMessages[finishReason] ?? `Model stopped: ${finishReason}`,
      };
    }
    const text = candidate?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!text) {
      return { ok: false, error: "No response from model." };
    }
    const parsed = parseParkingAnalysis(text);
    if (parsed) return { ok: true, data: parsed };
    return { ok: true, text };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return { ok: false, error: message };
  }
}
