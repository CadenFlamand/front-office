import type { PlayersById } from "./sleeper";

// Generational suffixes stripped only when they're the literal last word —
// never mid-string — so a name is never mis-truncated. Handles the exact
// mismatch FantasyPros' export has against Sleeper/FantasyCalc (e.g.
// FantasyPros' "James Cook III" vs Sleeper's plain "James Cook").
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function normalizePlayerName(name: string): string {
  const cleaned = name
    .replace(/[.']/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  if (cleaned.length === 0) return cleaned;

  const words = cleaned.split(" ");
  if (words.length > 1 && SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

export interface SleeperMatchIndex {
  bySleeperKey: Map<string, string[]>;
}

function sleeperPlayerName(player: PlayersById[string]): string {
  return player.full_name || [player.first_name, player.last_name].filter(Boolean).join(" ");
}

/** Indexes Sleeper's full player catalog by normalized-name + position for lookup. */
export function buildSleeperMatchIndex(players: PlayersById): SleeperMatchIndex {
  const bySleeperKey = new Map<string, string[]>();

  for (const [sleeperId, player] of Object.entries(players)) {
    if (!player.position) continue;
    const name = sleeperPlayerName(player);
    if (!name) continue;

    const key = `${normalizePlayerName(name)}|${player.position}`;
    const list = bySleeperKey.get(key) ?? [];
    list.push(sleeperId);
    bySleeperKey.set(key, list);
  }

  return { bySleeperKey };
}

export type MatchOutcome =
  | { sleeperId: string }
  | { error: "no-match" | "ambiguous" };

/**
 * Matches an external source's (name, position, team) against Sleeper's
 * catalog. Never guesses: zero candidates is "no-match", more than one
 * candidate that team can't uniquely disambiguate is "ambiguous" — callers
 * must log both, not silently drop or pick arbitrarily.
 */
// FantasyPros lumps fullbacks into "RB"; Sleeper classifies them
// separately as "FB" (e.g. Kyle Juszczyk, Hunter Luepke) — a real,
// systematic taxonomy difference between the two sources, not a guess, so
// it's worth trying as a fallback rather than logging every fullback as
// unmatched.
const POSITION_FALLBACKS: Record<string, string[]> = {
  RB: ["FB"],
};

function candidatesFor(index: SleeperMatchIndex, name: string, position: string): string[] {
  return index.bySleeperKey.get(`${normalizePlayerName(name)}|${position}`) ?? [];
}

export function matchPlayer(
  index: SleeperMatchIndex,
  players: PlayersById,
  name: string,
  position: string,
  team: string | null
): MatchOutcome {
  let candidates = candidatesFor(index, name, position);

  if (candidates.length === 0) {
    for (const fallbackPosition of POSITION_FALLBACKS[position] ?? []) {
      candidates = candidatesFor(index, name, fallbackPosition);
      if (candidates.length > 0) break;
    }
  }

  if (candidates.length === 0) return { error: "no-match" };
  if (candidates.length === 1) return { sleeperId: candidates[0] };

  if (team) {
    const teamMatches = candidates.filter((id) => players[id]?.team === team);
    if (teamMatches.length === 1) return { sleeperId: teamMatches[0] };
  }

  return { error: "ambiguous" };
}
