import { neon } from "@neondatabase/serverless";

import { getPlayoffOdds } from "@/lib/playoff-odds";
import { getLeague, getRosters, getTeamName, getUsers } from "@/lib/sleeper";

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
 * getRosters()/getLeague()/getPlayoffOdds() are still hardcoded to a
 * single league (see lib/sleeper.ts's own LEAGUE_ID), so `leagueId` is
 * validated against the league those calls actually return rather than
 * used to select which league gets fetched — passing any other ID throws
 * instead of silently mislabeling that league's data. Real multi-league
 * support is a bigger, separate change for later.
 */
export async function captureSnapshot(leagueId: string): Promise<CaptureSnapshotResult> {
  const [league, rosters, users, odds, week] = await Promise.all([
    getLeague(),
    getRosters(),
    getUsers(),
    getPlayoffOdds(),
    getCurrentWeek(),
  ]);

  if (league.league_id !== leagueId) {
    throw new Error(
      `captureSnapshot("${leagueId}") doesn't match the app's configured league ` +
        `("${league.league_id}") — getRosters()/getLeague()/getPlayoffOdds() only fetch ` +
        `that one hardcoded league today.`
    );
  }

  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const oddsByRosterId = new Map(odds.map((o) => [o.rosterId, o.playoffOdds]));

  await Promise.all(
    rosters.map((roster) => {
      const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
      const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};
      const starters = JSON.stringify(roster.starters ?? []);
      const playoffOdds = oddsByRosterId.get(roster.roster_id) ?? 0;

      return sql`
        INSERT INTO roster_snapshots
          (league_id, roster_id, team_name, season, week, starters, wins, losses, ties, playoff_odds)
        VALUES (
          ${league.league_id},
          ${roster.roster_id},
          ${getTeamName(owner)},
          ${league.season},
          ${week},
          ${starters}::jsonb,
          ${wins},
          ${losses},
          ${ties},
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
    leagueId: league.league_id,
    season: league.season,
    week,
    teamsCaptured: rosters.length,
  };
}
