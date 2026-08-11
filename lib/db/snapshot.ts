import { neon } from "@neondatabase/serverless";

import { getLeagueData } from "@/lib/league-data";
import { managerTeamName } from "@/lib/league-types";
import { getPlayoffOdds } from "@/lib/playoff-odds";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
const sql = neon(process.env.DATABASE_URL);

// Not exposed by lib/sleeper.ts and not league-scoped, so fetched directly
// here — same approach lib/trade-odds-action.ts uses for the same
// endpoint.
const NFL_STATE_URL = "https://api.sleeper.app/v1/state/nfl";

async function getCurrentWeek(): Promise<number> {
  const res = await fetch(NFL_STATE_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch current NFL week (${res.status})`);
  }
  const state = (await res.json()) as { week?: number; display_week?: number };
  return state.week && state.week > 0 ? state.week : (state.display_week ?? 1);
}

export interface CaptureSnapshotResult {
  leagueId: string;
  season: string;
  week: number;
  teamsCaptured: number;
}

/**
 * Captures the current week's roster/record/playoff-odds state for every
 * team in the league, upserting one row per team into roster_snapshots.
 * Safe to call more than once for the same week — rows are keyed on
 * (league_id, roster_id, season, week) and get replaced, not duplicated.
 *
 * Source-agnostic: reads through getLeagueData()/getPlayoffOdds(), so a
 * validated ESPN public league is snapshotted exactly like a Sleeper one, and
 * the odds-trend signal built on this history (lib/team-advice.ts) works the
 * same for both. Starters are stored as Sleeper player IDs either way, which
 * is what makes the history comparable across sources.
 */
export async function captureSnapshot(leagueId: string): Promise<CaptureSnapshotResult> {
  const [{ league, rosters, managers }, odds, week] = await Promise.all([
    getLeagueData(leagueId),
    getPlayoffOdds(leagueId),
    getCurrentWeek(),
  ]);

  const managersById = new Map(managers.map((manager) => [manager.ownerId, manager]));
  const oddsByRosterId = new Map(odds.map((o) => [o.rosterId, o.playoffOdds]));

  await Promise.all(
    rosters.map((roster) => {
      const manager = roster.ownerId ? managersById.get(roster.ownerId) : undefined;
      const starters = JSON.stringify(roster.starters);
      const playoffOdds = oddsByRosterId.get(roster.rosterId) ?? 0;

      return sql`
        INSERT INTO roster_snapshots
          (league_id, roster_id, team_name, season, week, starters, wins, losses, ties, playoff_odds)
        VALUES (
          ${leagueId},
          ${roster.rosterId},
          ${managerTeamName(manager)},
          ${league.season},
          ${week},
          ${starters}::jsonb,
          ${roster.wins},
          ${roster.losses},
          ${roster.ties},
          ${playoffOdds}
        )
        ON CONFLICT (league_id, roster_id, season, week)
        DO UPDATE SET
          team_name = EXCLUDED.team_name,
          starters = EXCLUDED.starters,
          wins = EXCLUDED.wins,
          losses = EXCLUDED.losses,
          ties = EXCLUDED.ties,
          playoff_odds = EXCLUDED.playoff_odds,
          captured_at = now()
      `;
    })
  );

  return {
    leagueId,
    season: league.season,
    week,
    teamsCaptured: rosters.length,
  };
}

/**
 * Recent playoff-odds history for one team, ascending by week — powers the
 * co-manager advice odds-trend signal (lib/team-advice.ts). First reader
 * ever written against roster_snapshots; captureSnapshot() above is
 * write-only.
 */
export async function getRecentOddsHistory(
  leagueId: string,
  rosterId: number,
  weeks = 4
): Promise<{ week: number; playoffOdds: number }[]> {
  const rows = await sql`
    SELECT week, playoff_odds
    FROM roster_snapshots
    WHERE league_id = ${leagueId} AND roster_id = ${rosterId}
    ORDER BY week DESC
    LIMIT ${weeks}
  `;
  return rows
    .map((row) => ({ week: row.week as number, playoffOdds: row.playoff_odds as number }))
    .reverse();
}
