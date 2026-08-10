// ESPN league-ID helpers. Deliberately dependency-free — no network, no DB,
// no imports at all — because isEspnLeagueId() is imported by client
// components the same way lib/manual-league.ts's isManualLeagueId() already
// is (components/co-manager-advice.tsx, components/team-roster.tsx,
// app/[leagueId]/trade/trade-analyzer.tsx). Keeping this module free of
// transitive imports is what stops a DB client from ever reaching a client
// bundle through the league-source discriminator, which is exactly how that
// happened once before (see lib/team-advice-format.ts's doc comment).

// Raw ESPN league IDs are plain numeric strings — and so are Sleeper's — so
// unlike the "manual-" prefix, the discriminator here can't be inferred from
// the ID's shape. (ESPN's run ~6-9 digits and Sleeper's ~19, but that's a
// coincidence of when each service started issuing them, not a guarantee, and
// a heuristic that breaks silently is worse than none.) The prefix makes the
// source explicit.
//
// The season is part of the ID rather than a separate column because ESPN
// reuses league IDs across seasons and its API is season-scoped — the season
// is in the request path, so it isn't optional context, it's part of the
// address. A league therefore gets a new app-level ID each season, which
// matches Phase 1's scope (current season only, no historical data).
export const ESPN_LEAGUE_ID_PREFIX = "espn-";

export interface EspnLeagueRef {
  season: number;
  espnLeagueId: string;
}

export function formatEspnLeagueId(season: number, espnLeagueId: string): string {
  return `${ESPN_LEAGUE_ID_PREFIX}${season}-${espnLeagueId}`;
}

export function isEspnLeagueId(leagueId: string): boolean {
  return parseEspnLeagueId(leagueId) !== null;
}

/**
 * Parses "espn-<season>-<leagueId>" back into its parts, or null if the ID
 * isn't one of ours.
 *
 * Validates both halves are numeric rather than just checking the prefix:
 * this is what isEspnLeagueId() is built on, and every consumer of that
 * discriminator goes on to build a URL from these parts. A malformed ID that
 * passed the prefix check but produced NaN would turn into a nonsense upstream
 * request instead of a clean "no such league".
 */
export function parseEspnLeagueId(leagueId: string): EspnLeagueRef | null {
  if (!leagueId.startsWith(ESPN_LEAGUE_ID_PREFIX)) return null;

  const rest = leagueId.slice(ESPN_LEAGUE_ID_PREFIX.length);
  const separator = rest.indexOf("-");
  if (separator <= 0) return null;

  const seasonPart = rest.slice(0, separator);
  const espnLeagueId = rest.slice(separator + 1);
  if (!/^\d{4}$/.test(seasonPart)) return null;
  if (!/^\d+$/.test(espnLeagueId)) return null;

  return { season: Number(seasonPart), espnLeagueId };
}
