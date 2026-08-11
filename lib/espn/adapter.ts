import type { EspnLeagueRef } from "../espn-league";
import type { LeagueData, LeagueInfo, LeagueManager, LeagueRoster } from "../league-types";
import { fetchEspnLeague } from "./client";
import {
  LINEUP_SLOT_TO_ROSTER_POSITION,
  NON_STARTER_SLOT_IDS,
  BENCH_SLOT_ID,
  IR_SLOT_ID,
  RECEPTIONS_STAT_ID,
  WR_POSITION_ID,
} from "./constants";
import {
  getSleeperResolutionIndex,
  logResolutionHealth,
  resolveEspnPlayers,
  type EspnPlayerResolution,
} from "./player-map";
import type { EspnLeagueResponse, EspnPlayer, EspnSettings, EspnTeam } from "./types";

/**
 * Translates ESPN's response into the app's neutral league shape
 * (lib/league-types.ts). Everything ESPN-specific — magic slot ids, scoring
 * item ids, the player-ID crosswalk — stops here; nothing downstream of this
 * module knows ESPN exists.
 */

/**
 * Expands ESPN's lineupSlotCounts into the flat roster-position list the app
 * expects, in Sleeper's vocabulary.
 *
 * Emits starters first, then bench, then IR, rather than in raw slot-id order
 * (which would put FLEX after the bench, since ESPN numbers FLEX 23 and bench
 * 20). Order doesn't affect countStarterSlots(), which only counts, but a list
 * that reads like a real lineup is easier to eyeball when something's wrong.
 */
function expandRosterPositions(settings: EspnSettings | undefined): string[] {
  const counts = settings?.rosterSettings?.lineupSlotCounts ?? {};
  const starters: string[] = [];
  const bench: string[] = [];
  const reserve: string[] = [];

  const slotIds = Object.keys(counts)
    .map(Number)
    .filter((slotId) => Number.isFinite(slotId))
    .sort((a, b) => a - b);

  for (const slotId of slotIds) {
    const count = counts[String(slotId)] ?? 0;
    if (count <= 0) continue;

    const position = LINEUP_SLOT_TO_ROSTER_POSITION[slotId];
    // Unmapped (IDP/coach/punter) slots are dropped rather than guessed at —
    // counting them would distort countStarterSlots()'s starter requirements.
    if (!position) continue;

    const target =
      slotId === BENCH_SLOT_ID ? bench : slotId === IR_SLOT_ID ? reserve : starters;
    for (let i = 0; i < count; i++) target.push(position);
  }

  return [...starters, ...bench, ...reserve];
}

/**
 * Reduces ESPN's reception scoring to the single points-per-reception number
 * the rest of the app carries.
 *
 * ESPN stores this either as a flat `points`, or — for leagues with
 * position-dependent scoring, i.e. TE premium — as `pointsOverrides` keyed by
 * ESPN position id. The WR value is taken as the league's headline PPR,
 * because that's what "PPR league" conventionally means and what FantasyCalc's
 * pricing model is calibrated on. TE-premium scoring genuinely isn't
 * representable in one number; taking WR is a known, documented approximation
 * rather than a silent one.
 *
 * Snapped to 0 / 0.5 / 1 using the same thresholds lib/playoff-odds.ts's
 * scoringFormat() already applies, so an unusual custom value (0.75, say)
 * lands on the same bucket everywhere rather than being passed raw to
 * FantasyCalc as an unsupported query parameter.
 */
function derivePprValue(settings: EspnSettings | undefined): number | undefined {
  const items = settings?.scoringSettings?.scoringItems;
  if (!items) return undefined;

  const receptions = items.find((item) => item.statId === RECEPTIONS_STAT_ID);
  // No reception rule at all is a meaningful answer — standard scoring — not
  // missing data.
  if (!receptions) return 0;

  const override = receptions.pointsOverrides?.[String(WR_POSITION_ID)];
  const raw = override ?? receptions.points ?? 0;

  if (raw >= 0.75) return 1;
  if (raw >= 0.25) return 0.5;
  return 0;
}

function espnTeamName(team: EspnTeam): string {
  const composed = [team.location, team.nickname].filter(Boolean).join(" ").trim();
  return team.name?.trim() || composed || team.abbrev || `Team ${team.id}`;
}

/**
 * The roster -> manager join key, which is deliberately per *team* rather than
 * per person.
 *
 * Sleeper guarantees one roster per user, so its user_id doubles as a team
 * key. ESPN guarantees no such thing: one member can own several teams (seen
 * on a real public league where a single account ran all four), and a team can
 * have no owner at all. Keying the join on ESPN's member GUID therefore
 * collapses every team that shares an owner onto whichever one was built last
 * — all four teams above rendered as "Denver Devils". The real person is still
 * carried on the manager as displayName; only the join key is synthetic.
 */
function ownerIdFor(team: EspnTeam): string {
  return `espn-team-${team.id}`;
}

function buildManagers(raw: EspnLeagueResponse): LeagueManager[] {
  const memberById = new Map((raw.members ?? []).map((member) => [member.id, member]));

  // Built by walking teams rather than members: the team name lives on the
  // team in ESPN's model (unlike Sleeper, where it's on the user), and members
  // who don't own a team aren't managers as far as this app is concerned.
  return (raw.teams ?? []).map((team) => {
    const memberId = team.primaryOwner ?? team.owners?.[0];
    const member = memberId ? memberById.get(memberId) : undefined;
    const displayName =
      member?.displayName?.trim() ||
      [member?.firstName, member?.lastName].filter(Boolean).join(" ").trim() ||
      "Unassigned";

    return {
      ownerId: ownerIdFor(team),
      displayName,
      teamName: espnTeamName(team),
      avatarUrl: team.logo,
    };
  });
}

function buildRoster(team: EspnTeam, resolution: EspnPlayerResolution): LeagueRoster {
  const players: string[] = [];
  const starters: string[] = [];

  for (const entry of team.roster?.entries ?? []) {
    const sleeperId = resolution.sleeperIdByEspnId.get(entry.playerId);
    // Unresolved players are omitted entirely rather than carried as ESPN IDs.
    // A foreign ID leaking into a players/starters array would silently miss
    // every value, projection and rank lookup downstream, which is far harder
    // to notice than an absent player. logResolutionHealth() is what surfaces
    // these.
    if (!sleeperId) continue;

    players.push(sleeperId);
    // Starter by exclusion, so an unrecognised or newly-added ESPN slot id
    // counts as a starter instead of vanishing from the lineup.
    if (!NON_STARTER_SLOT_IDS.has(entry.lineupSlotId)) starters.push(sleeperId);
  }

  const overall = team.record?.overall;
  return {
    rosterId: team.id,
    ownerId: ownerIdFor(team),
    players,
    starters,
    wins: overall?.wins ?? 0,
    losses: overall?.losses ?? 0,
    ties: overall?.ties ?? 0,
    pointsFor: overall?.pointsFor ?? 0,
    pointsAgainst: overall?.pointsAgainst ?? 0,
  };
}

function buildLeagueInfo(leagueId: string, raw: EspnLeagueResponse): LeagueInfo {
  const settings = raw.settings;
  const schedule = settings?.scheduleSettings;
  const totalRosters = settings?.size ?? raw.teams?.length ?? 0;

  // Regular season length is counted in *matchup periods*, but the odds engine
  // works in NFL weeks. These are 1:1 in almost every league, but multi-week
  // matchups are legal, so the last regular-season period's real weeks are
  // read from ESPN's own mapping when it's there.
  const matchupPeriodCount = schedule?.matchupPeriodCount ?? 0;
  const lastRegularWeeks = schedule?.matchupPeriods?.[String(matchupPeriodCount)];
  const playoffWeekStart =
    lastRegularWeeks && lastRegularWeeks.length > 0
      ? Math.max(...lastRegularWeeks) + 1
      : matchupPeriodCount + 1;

  return {
    leagueId,
    name: settings?.name?.trim() || `ESPN league ${raw.id}`,
    season: String(raw.seasonId),
    totalRosters,
    rosterPositions: expandRosterPositions(settings),
    pprValue: derivePprValue(settings),
    // playoffTeamCount is 0 on leagues that never configured a playoff bracket
    // (confirmed on a real public league), which is "unset" rather than "no
    // playoffs" — falling back to half the field matches the Sleeper path.
    playoffTeams: schedule?.playoffTeamCount || Math.ceil(totalRosters / 2),
    playoffWeekStart,
    // ESPN expresses its trade deadline as an epoch timestamp
    // (settings.tradeSettings.deadlineDate), not a week number. Mapping one to
    // the other needs an NFL week calendar the app doesn't have, so this stays
    // undefined and the consumer applies its own default rather than being
    // handed a confidently wrong week.
    tradeDeadlineWeek: undefined,
  };
}

export interface EspnLeagueBundle {
  raw: EspnLeagueResponse;
  resolution: EspnPlayerResolution;
  data: LeagueData;
}

/**
 * Fetches and fully translates an ESPN league, keeping the raw response and
 * resolution alongside the translated data — lib/espn/sim-context.ts needs the
 * schedule, which the neutral shape has no home for.
 */
export async function loadEspnLeague(
  leagueId: string,
  ref: EspnLeagueRef
): Promise<EspnLeagueBundle> {
  const raw = await fetchEspnLeague(ref);

  const espnPlayers: EspnPlayer[] = [];
  for (const team of raw.teams ?? []) {
    for (const entry of team.roster?.entries ?? []) {
      const player = entry.playerPoolEntry?.player;
      if (player) espnPlayers.push(player);
    }
  }

  const index = await getSleeperResolutionIndex();
  const resolution = resolveEspnPlayers(index, espnPlayers);
  logResolutionHealth(leagueId, resolution);

  return {
    raw,
    resolution,
    data: {
      league: buildLeagueInfo(leagueId, raw),
      rosters: (raw.teams ?? []).map((team) => buildRoster(team, resolution)),
      managers: buildManagers(raw),
    },
  };
}

export async function getEspnLeagueData(
  leagueId: string,
  ref: EspnLeagueRef
): Promise<LeagueData> {
  const { data } = await loadEspnLeague(leagueId, ref);
  return data;
}
