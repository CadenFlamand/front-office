export interface VerdictPayload {
  rosterId: number;
  giveIds: string[];
  receiveIds: string[];
}

// Sleeper player IDs are either numeric strings or short team abbreviations
// (e.g. "CLE"), and roster IDs are small integers — all plain ASCII, so
// btoa/atob (no UTF-8 handling needed) is enough here and keeps this
// working in both the browser and Node without a Buffer dependency.
function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  return base64 + "=".repeat(padding);
}

function isValidPayload(data: unknown): data is VerdictPayload {
  if (typeof data !== "object" || data === null) return false;
  const { rosterId, giveIds, receiveIds } = data as Record<string, unknown>;

  if (typeof rosterId !== "number" || !Number.isInteger(rosterId)) return false;
  if (!Array.isArray(giveIds) || !giveIds.every((id) => typeof id === "string")) {
    return false;
  }
  if (!Array.isArray(receiveIds) || !receiveIds.every((id) => typeof id === "string")) {
    return false;
  }

  return true;
}

// Compact, URL-safe encoding of a trade for sharing — not signed or
// encrypted, just base64. Callers must treat a decoded payload as
// untrusted input (player/roster IDs may no longer exist) rather than
// assuming it round-tripped from encodeVerdict().
export function encodeVerdict(payload: VerdictPayload): string {
  const json = JSON.stringify(payload);
  return toBase64Url(btoa(json));
}

export function decodeVerdict(code: string): VerdictPayload | null {
  try {
    const json = atob(fromBase64Url(code));
    const data: unknown = JSON.parse(json);
    return isValidPayload(data) ? data : null;
  } catch {
    return null;
  }
}
