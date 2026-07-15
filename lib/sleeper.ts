const LEAGUE_ID = "872227487059767297";
const SLEEPER_BASE = "https://api.sleeper.app/v1";

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  roster_positions: string[];
}

export interface SleeperRosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts?: number;
  fpts_decimal?: number;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
  settings: SleeperRosterSettings | null;
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata: { team_name?: string } | null;
}

export interface SleeperPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
}

export type PlayersById = Record<string, SleeperPlayer>;

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Sleeper API request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

export function getLeague(): Promise<SleeperLeague> {
  return fetchJson(`${SLEEPER_BASE}/league/${LEAGUE_ID}`, {
    next: { revalidate: 3600 },
  });
}

export function getRosters(): Promise<SleeperRoster[]> {
  return fetchJson(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`, {
    next: { revalidate: 3600 },
  });
}

export function getUsers(): Promise<SleeperUser[]> {
  return fetchJson(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`, {
    next: { revalidate: 3600 },
  });
}

// This file is ~14MB, well over Next's 2MB fetch-cache entry limit, so it's
// cached manually in memory for the life of the server process instead of
// going through Next's built-in fetch cache.
const PLAYERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let playersCache: { data: PlayersById; fetchedAt: number } | null = null;

export async function getAllPlayers(): Promise<PlayersById> {
  if (playersCache && Date.now() - playersCache.fetchedAt < PLAYERS_CACHE_TTL_MS) {
    return playersCache.data;
  }
  const data = await fetchJson<PlayersById>(`${SLEEPER_BASE}/players/nfl`, {
    cache: "no-store",
  });
  playersCache = { data, fetchedAt: Date.now() };
  return data;
}

export function getTeamName(user: SleeperUser | undefined): string {
  return user?.metadata?.team_name || user?.display_name || "Unassigned Team";
}

export function getRecord(roster: SleeperRoster): string {
  const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function getPlayerName(playerId: string, players: PlayersById): string {
  const player = players[playerId];
  if (!player) return playerId;
  return (
    player.full_name ||
    [player.first_name, player.last_name].filter(Boolean).join(" ") ||
    playerId
  );
}

export function getAvatarUrl(avatar: string | null): string | undefined {
  return avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : undefined;
}
