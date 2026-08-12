"use server";

import { requireAdminAccess } from "@/lib/auth/dal";
import {
  createGmInsight,
  deleteGmInsight,
  getActiveGmInsightsForPlayers,
  listGmInsights,
  setGmInsightActive,
  updateGmInsight,
  type GmInsight,
} from "@/lib/db/gm-insights";
import { getLeagueData } from "@/lib/league-data";
import { getAllPlayers, getPlayerName } from "@/lib/sleeper";

export interface GmInsightWithPlayerName extends GmInsight {
  playerName: string | null;
}

/** listGmInsights() with player names resolved, for the admin list. */
export async function listGmInsightsForAdmin(): Promise<GmInsightWithPlayerName[]> {
  await requireAdminAccess();
  const [insights, allPlayers] = await Promise.all([listGmInsights(), getAllPlayers()]);
  return insights.map((insight) => ({
    ...insight,
    playerName: insight.playerId ? getPlayerName(insight.playerId, allPlayers) : null,
  }));
}

export interface GmInsightDisplay {
  id: number;
  content: string;
  playerId: string | null;
  playerName: string | null;
}

/**
 * Insights relevant to the currently viewed roster, resolved for display.
 * Deliberately *not* admin-gated — same shape as lib/odds-trend-action.ts's
 * getOddsTrendHistory (leagueId + rosterId in, does its own fetching), and
 * meant for every viewer of the dashboard, not just Caden.
 */
export async function getRelevantGmInsights(
  leagueId: string,
  rosterId: number
): Promise<GmInsightDisplay[]> {
  const [{ rosters }, allPlayers] = await Promise.all([
    getLeagueData(leagueId),
    getAllPlayers(),
  ]);
  const roster = rosters.find((r) => r.rosterId === rosterId);
  if (!roster) return [];

  const insights = await getActiveGmInsightsForPlayers(roster.players);
  return insights.map((insight) => ({
    id: insight.id,
    content: insight.content,
    playerId: insight.playerId,
    playerName: insight.playerId ? getPlayerName(insight.playerId, allPlayers) : null,
  }));
}

export type GmInsightActionResult = { ok: true } | { ok: false; error: string };

export async function createGmInsightAction(
  content: string,
  playerId: string | null
): Promise<GmInsightActionResult> {
  await requireAdminAccess();
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Content can't be empty." };
  await createGmInsight(trimmed, playerId);
  return { ok: true };
}

export async function updateGmInsightAction(
  id: number,
  content: string,
  playerId: string | null
): Promise<GmInsightActionResult> {
  await requireAdminAccess();
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Content can't be empty." };
  const updated = await updateGmInsight(id, trimmed, playerId);
  if (!updated) return { ok: false, error: "Insight not found." };
  return { ok: true };
}

export async function setGmInsightActiveAction(
  id: number,
  active: boolean
): Promise<GmInsightActionResult> {
  await requireAdminAccess();
  await setGmInsightActive(id, active);
  return { ok: true };
}

export async function deleteGmInsightAction(id: number): Promise<GmInsightActionResult> {
  await requireAdminAccess();
  await deleteGmInsight(id);
  return { ok: true };
}

export interface PlayerSearchResult {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
}

const PLAYER_SEARCH_LIMIT = 15;

/**
 * Server-side search over the ~14MB Sleeper player catalog for the admin
 * form's player picker. Never shipped to the client directly — getAllPlayers()
 * is cached in-process (lib/sleeper.ts), so repeat searches don't refetch.
 */
export async function searchPlayersAction(query: string): Promise<PlayerSearchResult[]> {
  await requireAdminAccess();
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const allPlayers = await getAllPlayers();
  const matches: PlayerSearchResult[] = [];
  for (const player of Object.values(allPlayers)) {
    if (matches.length >= PLAYER_SEARCH_LIMIT) break;
    if (!player.full_name?.toLowerCase().includes(needle)) continue;
    matches.push({
      playerId: player.player_id,
      name: player.full_name,
      position: player.position ?? "?",
      team: player.team ?? null,
    });
  }
  return matches;
}
