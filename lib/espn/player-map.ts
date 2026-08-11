import {
  buildSleeperMatchIndex,
  matchPlayer,
  type SleeperMatchIndex,
} from "../player-name-matching";
import { getAllPlayers, type PlayersById } from "../sleeper";
import { POSITION_BY_ID, PRO_TEAM_ABBREV } from "./constants";
import type { EspnPlayer } from "./types";

/**
 * Resolves ESPN players to Sleeper player IDs.
 *
 * This is the load-bearing risk in ESPN support and the reason it's isolated
 * in its own module: everything downstream of here — FantasyCalc/FantasyPros
 * values, projections, thin-position flags, the trade finder — is keyed by
 * Sleeper player ID. A player who doesn't resolve simply isn't visible to any
 * of it.
 *
 * The resolution order is deliberately the opposite of the obvious one, and
 * the reason is worth recording. Sleeper's catalog carries an `espn_id` field,
 * which looks like a free exact crosswalk. It isn't: coverage is a cliff, not
 * a gradient. Measured against the live catalog, players with 6+ years of
 * experience have it 100% of the time and players with 0-5 years have it ~3%
 * of the time — Sleeper stopped populating it around the 2020 draft class.
 * Every missing player is someone like Ja'Marr Chase, Trevor Lawrence,
 * Amon-Ra St. Brown or Kyle Pitts. An ID-first implementation passes a casual
 * test on veterans and silently drops the most valuable half of every roster.
 *
 * So: team defenses resolve by table (deterministic), everyone else resolves
 * by name, and `espn_id` is used only to break ties that name matching alone
 * reports as ambiguous. Measured on two real public leagues, this resolves
 * 180/181 and 64/64 players.
 */

// lib/sleeper.ts's SleeperPlayer type doesn't declare espn_id, but the raw API
// response carries it. Read through a narrow local type rather than widening
// the shared one — same approach lib/fantasycalc.ts takes for injury fields.
interface SleeperEspnIdField {
  espn_id?: string | number | null;
}

export interface SleeperResolutionIndex {
  players: PlayersById;
  matchIndex: SleeperMatchIndex;
  /** Sleeper player id keyed by ESPN player id, for the ambiguity tiebreak. */
  bySleeperEspnId: Map<string, string>;
}

// getAllPlayers() is already memory-cached for 24h; the derived indexes are
// cached alongside it so a request path never re-walks 12k players. Keyed off
// the catalog object identity rather than a timer, so the indexes are rebuilt
// exactly when (and only when) the underlying catalog is refetched.
let indexCache: { source: PlayersById; index: SleeperResolutionIndex } | null = null;

export async function getSleeperResolutionIndex(): Promise<SleeperResolutionIndex> {
  const players = await getAllPlayers();
  if (indexCache && indexCache.source === players) return indexCache.index;

  const bySleeperEspnId = new Map<string, string>();
  for (const [sleeperId, player] of Object.entries(players)) {
    const espnId = (player as SleeperEspnIdField).espn_id;
    if (espnId === null || espnId === undefined || espnId === "") continue;
    // First writer wins: a duplicate espn_id across two Sleeper records is a
    // data error on Sleeper's side, and silently overwriting would make which
    // one you get depend on object key order.
    const key = String(espnId);
    if (!bySleeperEspnId.has(key)) bySleeperEspnId.set(key, sleeperId);
  }

  const index: SleeperResolutionIndex = {
    players,
    matchIndex: buildSleeperMatchIndex(players),
    bySleeperEspnId,
  };
  indexCache = { source: players, index };
  return index;
}

/**
 * Names ESPN spells differently from Sleeper in a way normalizePlayerName()
 * can't reconcile — nicknames, not punctuation or suffixes (those are already
 * handled). Keyed by ESPN's spelling, lowercased.
 *
 * This is expected to grow by one or two entries a season and is deliberately
 * hand-maintained: the alternative is fuzzy matching, which would trade a
 * handful of known misses for an unknown number of confidently wrong matches.
 * Entries are only added after confirming both records are the same person.
 */
const NAME_ALIASES: Record<string, string> = {
  // ESPN uses the legal first name; Sleeper uses the one on the jersey.
  "kenneth gainwell": "Kenny Gainwell",
};

export type ResolutionMethod = "dst-table" | "name" | "espn-id-tiebreak";

export interface UnresolvedEspnPlayer {
  espnId: number;
  name: string;
  position: string | null;
  team: string | null;
  reason: "no-match" | "ambiguous" | "unknown-position";
}

export interface EspnPlayerResolution {
  /** Sleeper player id keyed by ESPN player id. */
  sleeperIdByEspnId: Map<number, string>;
  total: number;
  resolved: number;
  unresolved: UnresolvedEspnPlayer[];
  methodCounts: Record<ResolutionMethod, number>;
}

function espnPlayerName(player: EspnPlayer): string {
  return (
    player.fullName || [player.firstName, player.lastName].filter(Boolean).join(" ") || ""
  );
}

// A team defense's Sleeper player_id *is* the team abbreviation ("HOU", "NE"),
// verified against the live catalog — so once the pro team is known the mapping
// is exact and needs no name matching at all. ESPN encodes the same team in the
// player id as a negative number, -(16000 + proTeamId), which is used as a
// backstop when proTeamId itself is missing or the free-agent sentinel 0.
const DST_ID_OFFSET = 16000;

function resolveTeamDefense(player: EspnPlayer): string | null {
  const fromProTeam = player.proTeamId ? PRO_TEAM_ABBREV[player.proTeamId] : null;
  if (fromProTeam) return fromProTeam;

  if (player.id < 0) {
    const derivedProTeamId = -player.id - DST_ID_OFFSET;
    return PRO_TEAM_ABBREV[derivedProTeamId] ?? null;
  }
  return null;
}

/**
 * Resolves one ESPN player. Never guesses: an unresolvable player is reported,
 * not approximated, so a systematic ESPN change shows up as a resolution-rate
 * drop instead of a roster quietly filling with wrong people.
 */
function resolveOne(
  index: SleeperResolutionIndex,
  player: EspnPlayer
): { sleeperId: string; method: ResolutionMethod } | { error: UnresolvedEspnPlayer["reason"] } {
  const position = player.defaultPositionId
    ? (POSITION_BY_ID[player.defaultPositionId] ?? null)
    : null;
  if (!position) return { error: "unknown-position" };

  if (position === "DEF") {
    const sleeperId = resolveTeamDefense(player);
    return sleeperId ? { sleeperId, method: "dst-table" } : { error: "no-match" };
  }

  const rawName = espnPlayerName(player);
  const name = NAME_ALIASES[rawName.toLowerCase()] ?? rawName;
  const team = player.proTeamId ? (PRO_TEAM_ABBREV[player.proTeamId] ?? null) : null;

  const outcome = matchPlayer(index.matchIndex, index.players, name, position, team);
  if ("sleeperId" in outcome) return { sleeperId: outcome.sleeperId, method: "name" };

  // Only reached when the name matched several Sleeper records that the pro
  // team couldn't separate. espn_id is exact when present, so it's the right
  // tiebreak here even though its coverage is too poor to lead with.
  if (outcome.error === "ambiguous") {
    const sleeperId = index.bySleeperEspnId.get(String(player.id));
    if (sleeperId) return { sleeperId, method: "espn-id-tiebreak" };
  }

  return { error: outcome.error };
}

export function resolveEspnPlayers(
  index: SleeperResolutionIndex,
  players: EspnPlayer[]
): EspnPlayerResolution {
  const sleeperIdByEspnId = new Map<number, string>();
  const unresolved: UnresolvedEspnPlayer[] = [];
  const methodCounts: Record<ResolutionMethod, number> = {
    "dst-table": 0,
    name: 0,
    "espn-id-tiebreak": 0,
  };

  for (const player of players) {
    if (sleeperIdByEspnId.has(player.id)) continue;

    const outcome = resolveOne(index, player);
    if ("sleeperId" in outcome) {
      sleeperIdByEspnId.set(player.id, outcome.sleeperId);
      methodCounts[outcome.method] += 1;
      continue;
    }

    unresolved.push({
      espnId: player.id,
      name: espnPlayerName(player),
      position: player.defaultPositionId
        ? (POSITION_BY_ID[player.defaultPositionId] ?? null)
        : null,
      team: player.proTeamId ? (PRO_TEAM_ABBREV[player.proTeamId] ?? null) : null,
      reason: outcome.error,
    });
  }

  return {
    sleeperIdByEspnId,
    total: sleeperIdByEspnId.size + unresolved.length,
    resolved: sleeperIdByEspnId.size,
    unresolved,
    methodCounts,
  };
}

/**
 * Share of a league's players that resolved, 0-1. This is the early-warning
 * signal for "ESPN changed something": a healthy league sits at or near 1.0,
 * and a sustained drop means either a name-format change on their side or a
 * stale table in constants.ts.
 */
export function resolutionRate(resolution: EspnPlayerResolution): number {
  return resolution.total === 0 ? 1 : resolution.resolved / resolution.total;
}

// Below this, something is systematically wrong rather than a normal long tail
// (a couple of deep-bench practice-squad players failing to match is routine).
// Measured baseline on real public leagues is 0.994 and 1.000.
export const HEALTHY_RESOLUTION_RATE = 0.9;

export function logResolutionHealth(leagueId: string, resolution: EspnPlayerResolution): void {
  const rate = resolutionRate(resolution);
  const summary =
    `ESPN ${leagueId}: resolved ${resolution.resolved}/${resolution.total} players ` +
    `(${(rate * 100).toFixed(1)}%) ` +
    `[name ${resolution.methodCounts.name}, dst ${resolution.methodCounts["dst-table"]}, ` +
    `espn-id tiebreak ${resolution.methodCounts["espn-id-tiebreak"]}]`;

  if (rate < HEALTHY_RESOLUTION_RATE) {
    console.error(
      `${summary} — below the ${HEALTHY_RESOLUTION_RATE * 100}% health floor. ` +
        `Unresolved: ${resolution.unresolved
          .map((p) => `${p.position ?? "?"} ${p.name} (${p.reason})`)
          .join("; ")}`
    );
    return;
  }
  if (resolution.unresolved.length > 0) {
    console.warn(
      `${summary} — unresolved: ${resolution.unresolved
        .map((p) => `${p.position ?? "?"} ${p.name} (${p.reason})`)
        .join("; ")}`
    );
  }
}
