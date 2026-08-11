/**
 * The app's league-source-neutral data shape.
 *
 * Until ESPN support, the app had no internal shape distinct from Sleeper's —
 * SleeperLeague/SleeperRoster/SleeperUser *were* the internal types, and every
 * feature read Sleeper's field names and encodings directly. That was fine
 * with one real source (manual leagues sidestep it by running parallel modules
 * and accepting reduced functionality), but ESPN needs full functionality, so
 * the shape every feature reads has to stop being one provider's wire format.
 *
 * These types are that shape. Notably they use plain numbers for points rather
 * than Sleeper's split integer/hundredths pair (fpts + fpts_decimal): an ESPN
 * adapter emitting SleeperRoster objects would have to re-encode its own
 * floats into that pair purely to satisfy a format neither source actually
 * wants, which is the kind of lie in a data model that costs someone an
 * afternoon two years from now.
 *
 * Player IDs throughout are Sleeper player IDs regardless of source — that's
 * the app's universal player key (FantasyCalc, FantasyPros and Sleeper's
 * projections are all keyed by it), and translating into it is precisely what
 * lib/espn/player-map.ts exists to do.
 *
 * Deliberately free of imports so it can be referenced from anywhere,
 * including client components, without dragging a provider along.
 */

export interface LeagueInfo {
  /** The app-level league ID, including any source prefix. */
  leagueId: string;
  name: string;
  season: string;
  totalRosters: number;
  /**
   * Starting-lineup format in Sleeper's vocabulary ("QB", "RB", "FLEX",
   * "SUPER_FLEX", "BN", …). Consumed by countStarterSlots() and
   * countNumQbs(), both of which match on those exact strings.
   */
  rosterPositions: string[];
  /**
   * Points per reception (0, 0.5 or 1), or undefined if the source doesn't
   * expose scoring. Picks the projection field and FantasyCalc's pricing
   * model.
   */
  pprValue: number | undefined;
  /** How many teams make the playoffs. */
  playoffTeams: number;
  /**
   * First week of the playoffs; the regular season is everything before it.
   */
  playoffWeekStart: number;
  /**
   * Last week trades are allowed, or undefined if the source doesn't express
   * it as a week number. ESPN stores a deadline *timestamp* rather than a
   * week, and converting one to the other needs an NFL week calendar this app
   * doesn't carry — so ESPN leagues leave this undefined and consumers apply
   * their own default rather than being handed a wrong week.
   */
  tradeDeadlineWeek: number | undefined;
}

export interface LeagueRoster {
  /** Stable per-league team identifier, 1..N on both supported sources. */
  rosterId: number;
  /** Links to a LeagueManager; null when a team has no assigned manager. */
  ownerId: string | null;
  /** Every rostered player, as Sleeper player IDs. */
  players: string[];
  /** The starting lineup only, as Sleeper player IDs. */
  starters: string[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface LeagueManager {
  ownerId: string;
  /** The person's handle. */
  displayName: string;
  /** The team's name, which may or may not be distinct from displayName. */
  teamName: string;
  avatarUrl?: string;
}

export interface LeagueData {
  league: LeagueInfo;
  rosters: LeagueRoster[];
  managers: LeagueManager[];
}

/** One scheduled head-to-head, in NFL week numbers. */
export interface ScheduledMatchup {
  week: number;
  rosterIds: [number, number];
}

/**
 * Everything a playoff simulation needs that depends on where the league
 * lives: who's in it, how they've scored so far, and what's left to play.
 *
 * Each source builds one of these; lib/playoff-odds.ts's assembleSimContext()
 * turns it into a simulation context without ever learning which source it
 * came from. Declared here rather than next to the simulator so the ESPN and
 * Sleeper builders can both depend on it without a cycle.
 */
export interface LeagueSimInputs {
  league: LeagueInfo;
  rosters: LeagueRoster[];
  managers: LeagueManager[];
  /** Per-roster list of real scores from weeks already played. */
  actualScoresByRoster: Map<number, number[]>;
  remainingSchedule: ScheduledMatchup[];
}

export function formatRecord(roster: Pick<LeagueRoster, "wins" | "losses" | "ties">): string {
  return roster.ties > 0
    ? `${roster.wins}-${roster.losses}-${roster.ties}`
    : `${roster.wins}-${roster.losses}`;
}

export function managerTeamName(manager: LeagueManager | undefined): string {
  return manager?.teamName || manager?.displayName || "Unassigned Team";
}

export function managerDisplayName(manager: LeagueManager | undefined): string {
  return manager?.displayName ?? "Unassigned";
}
