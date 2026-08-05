import type { PlayoffBucket } from "./team-context";
import type { TradeLabel } from "./trade-label";
import type { TradeOddsDiff } from "./trade-odds-action";
import type { TradeVerdict, VerdictTone } from "./trade-verdict";

export interface TradeSidePlayer {
  sleeperId: string;
  // Composite FantasyCalc+FantasyPros value (lib/fantasycalc.ts's
  // getPlayerValues()), frozen at share time — see VerdictPayload's comment.
  value: number;
}

// Everything here is captured once, at the moment Share is clicked in
// trade-analyzer.tsx, from values already resolved for the on-screen
// display — never recomputed from a decoded payload. A shared link is a
// snapshot of "what the verdict said when you shared it," not a live query:
// re-simulating on every page load let playoff odds (and therefore the
// headline/cautions) drift a few points between reloads of the same link,
// which read as a bug even though it was just Monte Carlo noise. Only
// cosmetic reference data (player name/position, team name/record) is left
// to resolve live when the link is opened — see app/trade/verdict/[code]/
// page.tsx.
export interface VerdictPayload {
  leagueId: string;
  rosterId: number;
  give: TradeSidePlayer[];
  receive: TradeSidePlayer[];
  diff: number;
  odds: TradeOddsDiff;
  tradeLabel: TradeLabel;
  // Just enough of the team's situation at share time to render
  // TeamContextLine's sentence ("As a Playoff Favorite thin at RB/TE...")
  // without it drifting out of sync with the frozen verdict.helps below —
  // both bucket and thinPositions are themselves derived from the same
  // odds/value snapshot this payload exists to freeze.
  team: { bucket: PlayoffBucket; thinPositions: string[] };
  verdict: TradeVerdict;
}

// The payload now carries real verdict sentences (em dashes, etc.), not
// just ASCII IDs, so plain btoa/atob (Latin1-only) isn't enough — bytes are
// UTF-8-encoded via TextEncoder/TextDecoder first. Both are global in
// browsers and Node, so this works identically in trade-analyzer.tsx's
// client-side encodeVerdict() and the server-side decodeVerdict() callers.
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(padding));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const TRADE_LABELS: readonly TradeLabel[] = [
  "Roster Tune-Up",
  "Value Add",
  "Win-Now Swing",
  "Blockbuster Deal",
];
const PLAYOFF_BUCKETS: readonly PlayoffBucket[] = [
  "Playoff Favorite",
  "Playoff Contender",
  "Playoff Hopeful",
];
const VERDICT_TONES: readonly VerdictTone[] = ["positive", "negative", "neutral"];

function isTradeSidePlayerArray(data: unknown): data is TradeSidePlayer[] {
  return (
    Array.isArray(data) &&
    data.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const { sleeperId, value } = item as Record<string, unknown>;
      return typeof sleeperId === "string" && typeof value === "number";
    })
  );
}

function isTradeOddsDiff(data: unknown): data is TradeOddsDiff {
  if (typeof data !== "object" || data === null) return false;
  const { before, after } = data as Record<string, unknown>;
  return typeof before === "number" && typeof after === "number";
}

function isTeamSnapshot(data: unknown): data is VerdictPayload["team"] {
  if (typeof data !== "object" || data === null) return false;
  const { bucket, thinPositions } = data as Record<string, unknown>;
  return (
    typeof bucket === "string" &&
    (PLAYOFF_BUCKETS as string[]).includes(bucket) &&
    Array.isArray(thinPositions) &&
    thinPositions.every((position) => typeof position === "string")
  );
}

function isTradeVerdict(data: unknown): data is TradeVerdict {
  if (typeof data !== "object" || data === null) return false;
  const { headline, tone, helps, valueCaption, cautions } = data as Record<string, unknown>;
  return (
    typeof headline === "string" &&
    typeof tone === "string" &&
    (VERDICT_TONES as string[]).includes(tone) &&
    typeof helps === "boolean" &&
    typeof valueCaption === "string" &&
    Array.isArray(cautions) &&
    cautions.every((caution) => typeof caution === "string")
  );
}

function isValidPayload(data: unknown): data is VerdictPayload {
  if (typeof data !== "object" || data === null) return false;
  const { leagueId, rosterId, give, receive, diff, odds, tradeLabel, team, verdict } =
    data as Record<string, unknown>;

  if (typeof leagueId !== "string" || leagueId.length === 0) return false;
  if (typeof rosterId !== "number" || !Number.isInteger(rosterId)) return false;
  if (!isTradeSidePlayerArray(give) || !isTradeSidePlayerArray(receive)) return false;
  if (typeof diff !== "number") return false;
  if (!isTradeOddsDiff(odds)) return false;
  if (typeof tradeLabel !== "string" || !(TRADE_LABELS as string[]).includes(tradeLabel)) {
    return false;
  }
  if (!isTeamSnapshot(team)) return false;
  if (!isTradeVerdict(verdict)) return false;

  return true;
}

// Compact, URL-safe encoding of a trade verdict for sharing — not signed or
// encrypted, just base64. Callers must treat a decoded payload as untrusted
// input (player/roster IDs may no longer exist) rather than assuming it
// round-tripped from encodeVerdict().
export function encodeVerdict(payload: VerdictPayload): string {
  const json = JSON.stringify(payload);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeVerdict(code: string): VerdictPayload | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(code));
    const data: unknown = JSON.parse(json);
    return isValidPayload(data) ? data : null;
  } catch {
    return null;
  }
}
