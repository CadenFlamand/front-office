import { getFantasyProsValues } from "./fantasypros-values";
import { fetchJson } from "./http";
import { getAllPlayers } from "./sleeper";

export interface TradeablePlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
  positionRank: number;
  injuryStatus: string | null;
  yearsExperience: number;
}

interface FantasyCalcEntry {
  player: {
    sleeperId: string | null;
    name: string;
    position: string;
    maybeTeam: string | null;
  };
  value: number;
  positionRank: number;
}

// lib/sleeper.ts's SleeperPlayer type doesn't declare these fields, but the
// raw Sleeper API response includes them — accessed via this narrower local
// type rather than widening the shared type (which is out of scope here).
interface SleeperInjuryFields {
  injury_status?: string | null;
  years_exp?: number;
}

export interface FantasyCalcLeagueSettings {
  totalRosters: number;
  // League's points-per-reception setting (0, 0.5, or 1) — same value used
  // elsewhere for this exact purpose in lib/playoff-odds.ts's
  // projectionField(). Falls back to full PPR (1) if the caller doesn't
  // have it.
  pprValue: number | undefined;
  rosterPositions: string[];
}

function countNumQbs(rosterPositions: string[]): number {
  const qbSlots = rosterPositions.filter((slot) => slot === "QB").length;
  const hasSuperFlex = rosterPositions.includes("SUPER_FLEX");
  // FantasyCalc's numQbs models how many QBs a lineup must start, which
  // drives its superflex/2-QB value premiums. A SUPER_FLEX slot doesn't
  // strictly require a QB, but leagues that carry one almost always use it
  // as a de facto second QB slot, so it's counted as +1 here. Unclear
  // whether FantasyCalc's pricing actually distinguishes "2 dedicated QB
  // slots" from "1 QB + 1 superflex" — if it does, this may need to be
  // more precise than a flat +1.
  return qbSlots + (hasSuperFlex ? 1 : 0);
}

function buildFantasyCalcUrl(settings: FantasyCalcLeagueSettings): string {
  const numQbs = countNumQbs(settings.rosterPositions);
  const ppr = settings.pprValue ?? 1;
  return `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=${numQbs}&numTeams=${settings.totalRosters}&ppr=${ppr}`;
}

// FantasyCalc values only move periodically, so each distinct query is
// cached in memory for the life of the server process instead of refetched
// on every request. Keyed by the built URL so different leagues (different
// team counts / scoring / QB requirements) get their own cache entry rather
// than sharing one global result.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { players: TradeablePlayer[]; fetchedAt: number }>();

export async function getPlayerValues(
  settings: FantasyCalcLeagueSettings
): Promise<TradeablePlayer[]> {
  const url = buildFantasyCalcUrl(settings);

  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.players;
  }

  const [data, allPlayersRaw, fantasyProsById] = await Promise.all([
    fetchJson<FantasyCalcEntry[]>(url, { cache: "no-store" }),
    getAllPlayers(),
    getFantasyProsValues(),
  ]);
  const allPlayers = allPlayersRaw as unknown as Record<string, SleeperInjuryFields>;
  const remainingFantasyPros = new Map(fantasyProsById);

  // Composite value = average of FantasyCalc + FantasyPros' converted
  // value when both sources have a player; the single source's value when
  // only one does. positionRank stays FantasyCalc's own market-value rank
  // for players FantasyCalc prices — only .value is blended, to keep this
  // scoped to trade value rather than rippling into every rank-based check
  // elsewhere in the app (computeThinPositions(), production pace, etc.).
  const players: TradeablePlayer[] = data
    .filter((entry) => entry.player.sleeperId)
    .map((entry) => {
      const sleeperId = entry.player.sleeperId as string;
      const sleeperPlayer: SleeperInjuryFields | undefined = allPlayers[sleeperId];
      const fantasyPros = remainingFantasyPros.get(sleeperId);
      remainingFantasyPros.delete(sleeperId);

      return {
        sleeperId,
        name: entry.player.name,
        position: entry.player.position,
        team: entry.player.maybeTeam,
        value: fantasyPros
          ? Math.round((entry.value + fantasyPros.convertedValue) / 2)
          : entry.value,
        positionRank: entry.positionRank,
        injuryStatus: sleeperPlayer?.injury_status ?? null,
        // Sleeper omits years_exp for essentially nothing in FantasyCalc's
        // (skill-position, actively rostered) pool, but defaults to 0
        // (i.e. "rookie") rather than a sentinel if it's ever missing —
        // acceptable for a first-pass signal, per the label logic that
        // consumes it.
        yearsExperience: sleeperPlayer?.years_exp ?? 0,
      };
    });

  // Players FantasyCalc doesn't price at all (its pool tops out around 200;
  // FantasyPros' export goes much deeper) still get a value from
  // FantasyPros alone, using its own position-relative rank rather than
  // fabricating one — this meaningfully deepens the "valued player" pool
  // that drives thin-position/depth checks elsewhere, not just trade value.
  for (const [sleeperId, fantasyPros] of remainingFantasyPros) {
    const sleeperPlayer: SleeperInjuryFields | undefined = allPlayers[sleeperId];
    players.push({
      sleeperId,
      name: fantasyPros.playerName,
      position: fantasyPros.position,
      team: allPlayersRaw[sleeperId]?.team ?? null,
      value: fantasyPros.convertedValue,
      positionRank: fantasyPros.positionRank,
      injuryStatus: sleeperPlayer?.injury_status ?? null,
      yearsExperience: sleeperPlayer?.years_exp ?? 0,
    });
  }

  cache.set(url, { players, fetchedAt: Date.now() });
  return players;
}
