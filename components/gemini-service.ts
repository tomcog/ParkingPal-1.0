const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

import { projectId, publicAnonKey } from "/utils/supabase/info";

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-d62065e1`;

const serverHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
});

// One-time flag to track if we've synced localStorage → server
let hasSyncedToServer = false;

/**
 * Ensures that any key stored in localStorage (from before server sync was added)
 * gets pushed to the server. Runs once per session.
 */
async function ensureSyncedToServer(): Promise<void> {
  if (hasSyncedToServer) return;
  hasSyncedToServer = true;

  const localKey = localStorage.getItem("gemini_api_key");
  if (!localKey) return;

  // Check if server already has a key
  try {
    const res = await fetch(`${SERVER_BASE}/api-key`, {
      headers: serverHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (!data.key) {
        // Server doesn't have the key yet — push it
        console.log("Syncing API key from localStorage to server...");
        await fetch(`${SERVER_BASE}/api-key`, {
          method: "PUT",
          headers: serverHeaders(),
          body: JSON.stringify({ key: localKey }),
        });
      }
    }
  } catch (err) {
    console.error("Error during API key sync to server:", err);
  }
}

export interface ParkingAnalysis {
  canPark: "yes" | "no" | "conditional";
  summary: string;
  details: string[];
  restrictions: string[];
  timeInfo: string;
  confidence: "high" | "medium" | "low";
  parkUntil?: string | null;
  parkAfter?: string | null;
  parkAfterLabel?: string | null;
  nextRestriction?: {
    time: string; // HH:MM 24-hour format
    label: string; // e.g. "Street cleaning begins"
  } | null;
}

function buildPrompt(permits: string[] = []): string {
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const date = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const permitSection = permits.length > 0
    ? `\n\nThe driver has the following parking permits: ${permits.join(", ")}. If any sign on the image grants an exemption or special privilege to holders of one of these permits, factor that into your analysis. For example, a "No Parking — Permit X Exempt" sign means the driver CAN park if they hold permit X.`
    : "";

  return `You are a parking sign analysis assistant. Analyze the parking sign(s) in this image and determine whether someone can park here RIGHT NOW.

Current date and time: ${dayOfWeek}, ${date} at ${time}${permitSection}

Please respond in the following JSON format ONLY (no markdown, no code fences, just raw JSON):
{
  "canPark": "yes" | "no" | "conditional",
  "summary": "A brief one-sentence summary of whether parking is allowed right now",
  "details": ["Array of specific rules/details found on the sign"],
  "restrictions": ["Array of any restrictions or conditions that apply"],
  "timeInfo": "Information about time-based restrictions relative to the current time",
  "confidence": "high" | "medium" | "low",
  "parkUntil": "HH:MM" | null, // 24-hour format
  "parkAfter": "HH:MM" | null, // 24-hour format
  "parkAfterLabel": "short description" | null,
  "nextRestriction": { "time": "HH:MM", "label": "short description" } | null
}

If "canPark" is "conditional", explain what conditions apply.
If the image doesn't contain a parking sign, set "canPark" to "conditional" with a summary explaining that no parking sign was detected.
Be specific about time windows, days, and any special conditions visible on the sign.

IMPORTANT — "nextRestriction" rules:
• Only populate "nextRestriction" when "canPark" is "yes" AND a parking restriction (street cleaning, no-parking window, meter limit, tow-away zone, etc.) will begin within the next 4 hours on the current day (${dayOfWeek}).
• "time" must be in 24-hour HH:MM format representing the exact local time the restriction starts (e.g. "14:00").
• "label" should be a short human-readable description of the restriction (e.g. "Street cleaning begins", "No parking zone starts", "2-hour limit ends").
• If no restriction is approaching within 4 hours, or if "canPark" is "no" or "conditional", set "nextRestriction" to null.

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
• If "canPark" is "yes" or "conditional", set "parkAfter" and "parkAfterLabel" to null.`;
}

export async function analyzeSign(
  imageBase64: string,
  apiKey: string,
  mimeType: string = "image/jpeg",
  permits: string[] = []
): Promise<ParkingAnalysis> {
  const prompt = buildPrompt(permits);

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 400) {
      throw new Error(
        "Invalid request. Please make sure you uploaded a clear image of a parking sign."
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Invalid API key. Please check your Gemini API key in Settings."
      );
    }
    if (response.status === 429) {
      throw new Error(
        "Rate limit exceeded. Please wait a moment and try again."
      );
    }
    throw new Error(`API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Try to parse JSON from the response
  try {
    // Remove any potential markdown code fences
    const cleanText = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanText);
    return {
      canPark: parsed.canPark || "conditional",
      summary: parsed.summary || "Unable to determine parking status.",
      details: parsed.details || [],
      restrictions: parsed.restrictions || [],
      timeInfo: parsed.timeInfo || "No time information available.",
      confidence: parsed.confidence || "low",
      parkUntil: parsed.parkUntil || null,
      parkAfter: parsed.parkAfter || null,
      parkAfterLabel: parsed.parkAfterLabel || null,
      nextRestriction: parsed.nextRestriction || null,
    };
  } catch {
    // If JSON parsing fails, return a structured response from the raw text
    return {
      canPark: "conditional",
      summary: text.slice(0, 200) || "Unable to parse the parking sign analysis.",
      details: [text],
      restrictions: [],
      timeInfo: "Could not determine time-based restrictions.",
      confidence: "low",
      parkUntil: null,
      parkAfter: null,
      parkAfterLabel: null,
      nextRestriction: null,
    };
  }
}

export async function getApiKey(): Promise<string | null> {
  // Check localStorage cache first for speed
  const cached = localStorage.getItem("gemini_api_key");
  if (cached) {
    // Kick off background sync (non-blocking) to ensure server has it too
    ensureSyncedToServer();
    return cached;
  }

  // Fall back to server
  try {
    const res = await fetch(`${SERVER_BASE}/api-key`, {
      headers: serverHeaders(),
    });
    if (!res.ok) {
      console.error("Failed to fetch API key from server:", await res.text());
      return null;
    }
    const data = await res.json();
    if (data.key) {
      localStorage.setItem("gemini_api_key", data.key);
      return data.key;
    }
    return null;
  } catch (err) {
    console.error("Error fetching API key from server:", err);
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  // Save to localStorage for fast access
  localStorage.setItem("gemini_api_key", key);

  // Persist to server
  try {
    const res = await fetch(`${SERVER_BASE}/api-key`, {
      method: "PUT",
      headers: serverHeaders(),
      body: JSON.stringify({ key }),
    });
    if (!res.ok) {
      console.error("Failed to save API key to server:", await res.text());
    }
  } catch (err) {
    console.error("Error saving API key to server:", err);
  }
}

export async function removeApiKey(): Promise<void> {
  localStorage.removeItem("gemini_api_key");

  try {
    const res = await fetch(`${SERVER_BASE}/api-key`, {
      method: "DELETE",
      headers: serverHeaders(),
    });
    if (!res.ok) {
      console.error("Failed to delete API key from server:", await res.text());
    }
  } catch (err) {
    console.error("Error deleting API key from server:", err);
  }
}

export interface ScanHistoryItem {
  id: string;
  timestamp: number;
  imageDataUrl: string;
  analysis: ParkingAnalysis;
}

export function getScanHistory(): ScanHistoryItem[] {
  try {
    const raw = localStorage.getItem("parking_scan_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addScanToHistory(item: ScanHistoryItem): void {
  const history = getScanHistory();
  history.unshift(item);
  // Keep only the last 20 scans
  const trimmed = history.slice(0, 20);
  localStorage.setItem("parking_scan_history", JSON.stringify(trimmed));
}

export function clearScanHistory(): void {
  localStorage.removeItem("parking_scan_history");
}

export async function getPermits(): Promise<string[]> {
  try {
    const res = await fetch(`${SERVER_BASE}/permits`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.permits) ? data.permits : [];
  } catch (err) {
    console.error("Error fetching permits:", err);
    return [];
  }
}