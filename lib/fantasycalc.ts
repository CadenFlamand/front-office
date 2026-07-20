export interface TradeablePlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
}

interface FantasyCalcEntry {
  player: {
    sleeperId: string | null;
    name: string;
    position: string;
    maybeTeam: string | null;
  };
  value: number;
}

const FANTASYCALC_URL =
  "https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1";

// FantasyCalc values only move periodically, so this is cached in memory for
// the life of the server process instead of refetched on every request.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { players: TradeablePlayer[]; fetchedAt: number } | null = null;

export async function getPlayerValues(): Promise<TradeablePlayer[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.players;
  }

  const res = await fetch(FANTASYCALC_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`FantasyCalc request failed (${res.status})`);
  }

  const data = (await res.json()) as FantasyCalcEntry[];
  const players = data
    .filter((entry) => entry.player.sleeperId)
    .map((entry) => ({
      sleeperId: entry.player.sleeperId as string,
      name: entry.player.name,
      position: entry.player.position,
      team: entry.player.maybeTeam,
      value: entry.value,
    }));

  cache = { players, fetchedAt: Date.now() };
  return players;
}
