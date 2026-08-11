import type { EspnLeagueRef } from "../espn-league";
import type { LeagueSimInputs, ScheduledMatchup } from "../league-types";
import { loadEspnLeague } from "./adapter";
import { REGULAR_SEASON_TIER, UNDECIDED } from "./constants";
import type { EspnLeagueResponse, EspnScheduleGame } from "./types";

/**
 * Builds the playoff simulator's inputs from an ESPN league.
 *
 * The notable difference from the Sleeper path is what *isn't* here. Sleeper
 * exposes no completion flag, so lib/playoff-odds.ts's isWeekComplete() has to
 * infer whether a week has finished from live NFL season state — the source of
 * the preseason week-numbering and mid-week "points > 0" traps documented
 * there. ESPN marks every game UNDECIDED until it's final, so this reads the
 * answer directly and none of that inference applies.
 */

// A game counts toward playoff seeding only if it's in the regular season:
// within the configured matchup-period count, and not part of a bracket or
// consolation ladder (which reuse period numbers past the regular season).
function isRegularSeason(game: EspnScheduleGame, matchupPeriodCount: number): boolean {
  const tier = game.playoffTierType ?? REGULAR_SEASON_TIER;
  return tier === REGULAR_SEASON_TIER && game.matchupPeriodId <= matchupPeriodCount;
}

/**
 * ESPN counts the season in matchup periods, but the simulator works in NFL
 * weeks (that's what projections are keyed by). They're 1:1 in almost every
 * league; where they aren't, ESPN's own period-to-weeks mapping is
 * authoritative, and the period's first week is the one to project.
 */
function weekForPeriod(raw: EspnLeagueResponse, matchupPeriodId: number): number {
  const weeks = raw.settings?.scheduleSettings?.matchupPeriods?.[String(matchupPeriodId)];
  if (weeks && weeks.length > 0) return Math.min(...weeks);
  return matchupPeriodId;
}

export async function buildEspnSimInputs(
  leagueId: string,
  ref: EspnLeagueRef
): Promise<LeagueSimInputs> {
  const { raw, data } = await loadEspnLeague(leagueId, ref);
  const { league, rosters, managers } = data;

  const matchupPeriodCount = league.playoffWeekStart - 1;

  const actualScoresByRoster = new Map<number, number[]>();
  for (const roster of rosters) actualScoresByRoster.set(roster.rosterId, []);

  const remainingSchedule: ScheduledMatchup[] = [];

  for (const game of raw.schedule ?? []) {
    if (!isRegularSeason(game, matchupPeriodCount)) continue;

    if (game.winner !== UNDECIDED) {
      // Already played. Recorded per side rather than per matchup so a bye
      // (which has no `away`) still contributes the one real score it produced
      // instead of being dropped from that team's scoring history.
      for (const side of [game.home, game.away]) {
        if (!side) continue;
        actualScoresByRoster.get(side.teamId)?.push(side.totalPoints ?? 0);
      }
      continue;
    }

    // Still to play. Needs two sides — a bye isn't a game anyone can win, and
    // feeding a one-sided matchup to the simulator would be meaningless.
    if (!game.home || !game.away) continue;
    remainingSchedule.push({
      week: weekForPeriod(raw, game.matchupPeriodId),
      rosterIds: [game.home.teamId, game.away.teamId],
    });
  }

  return { league, rosters, managers, actualScoresByRoster, remainingSchedule };
}
