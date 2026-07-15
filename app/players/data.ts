export interface PlayerSummary {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  injuryStatus: string | null;
  status: string | null;
}

interface SleeperPlayerRecord {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
  injury_status?: string | null;
  status?: string | null;
}

type SleeperPlayersResponse = Record<string, SleeperPlayerRecord>;

const PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache: { players: PlayerSummary[]; fetchedAt: number } | null = null;

function playerName(player: SleeperPlayerRecord): string {
  return (
    player.full_name?.trim() ||
    [player.first_name, player.last_name].filter(Boolean).join(" ").trim() ||
    "Unknown player"
  );
}

export async function getPlayers(): Promise<PlayerSummary[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.players;
  }

  const response = await fetch(PLAYERS_URL, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Sleeper player request failed (${response.status})`);
  }

  const data = (await response.json()) as SleeperPlayersResponse;
  const players = Object.entries(data)
    .map(([id, player]) => ({
      id: player.player_id || id,
      name: playerName(player),
      position: player.position || null,
      team: player.team || null,
      injuryStatus: player.injury_status || null,
      status: player.status || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { players, fetchedAt: Date.now() };
  return players;
}
