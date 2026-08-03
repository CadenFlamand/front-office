import type { ManualTeam } from "./db/manual-leagues";
import type { PlayoffBucket } from "./team-context";

// Real Sleeper league IDs are always plain numeric strings, so this prefix
// can never collide — it's the single discriminator used everywhere in the
// app to decide whether a leagueId is manually-entered or Sleeper-backed,
// rather than a separate "source" column requiring an extra DB round trip
// just to know which data path to take.
export const MANUAL_LEAGUE_ID_PREFIX = "manual-";

export function generateManualLeagueId(): string {
  return `${MANUAL_LEAGUE_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isManualLeagueId(leagueId: string): boolean {
  return leagueId.startsWith(MANUAL_LEAGUE_ID_PREFIX);
}

// Manual leagues have no simulated playoff-odds number to threshold the
// way lib/team-context.ts's getPlayoffBucket() does — so bucket here is
// rank-based thirds by win% instead: sort teams by record, top third =
// Favorite, bottom third = Hopeful. Same Math.ceil(totalTeams/3) sizing as
// the gap threshold in lib/team-advice.ts's computeDiagnosticNote, for the
// same small-league degrade-gracefully reason (e.g. a 2-team league gets
// Favorite/Hopeful with no Contender, rather than a lopsided or empty tier).
export function getManualBucket(rank: number, totalTeams: number): PlayoffBucket {
  const third = Math.ceil(totalTeams / 3);
  if (rank <= third) return "Playoff Favorite";
  if (rank > totalTeams - third) return "Playoff Hopeful";
  return "Playoff Contender";
}

function manualWinPct(team: ManualTeam): number {
  const games = team.wins + team.losses + team.ties;
  return games > 0 ? (team.wins + 0.5 * team.ties) / games : 0;
}

// Record rank only — no points-for equivalent, since that needs weekly
// scoring data manual leagues don't have (PF rank/Stage-1 diagnostic are
// skipped entirely for manual leagues, per the feature's scope). Same
// win%-desc/id-asc tiebreak style as lib/standings.ts's
// computeStandingsRanks, just over ManualTeam's flat wins/losses/ties
// instead of SleeperRoster.settings.
export function computeManualStandingsRanks(teams: ManualTeam[]): Map<number, number> {
  const sorted = [...teams].sort(
    (a, b) => manualWinPct(b) - manualWinPct(a) || a.id - b.id
  );
  return new Map(sorted.map((team, i) => [team.id, i + 1]));
}

export function formatManualRecord(team: ManualTeam): string {
  return team.ties > 0
    ? `${team.wins}-${team.losses}-${team.ties}`
    : `${team.wins}-${team.losses}`;
}
