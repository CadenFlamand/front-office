import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OddsDiffLine, TeamContextLine, Verdict } from "@/app/[leagueId]/trade/trade-analyzer";
import {
  getAllPlayers,
  getPlayerName,
  getRecord,
  getRosters,
  getTeamName,
  getUsers,
  type PlayersById,
} from "@/lib/sleeper";
import type { TeamContext } from "@/lib/team-context";
import { decodeVerdict, type TradeSidePlayer, type VerdictPayload } from "@/lib/verdict-share";

interface DisplayPlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
}

export interface VerdictView {
  leagueId: string;
  team: TeamContext;
  givePlayers: DisplayPlayer[];
  receivePlayers: DisplayPlayer[];
  giveTotal: number;
  receiveTotal: number;
  payload: VerdictPayload;
}

// Resolves each frozen {sleeperId, value} into something displayable, or
// null if any single ID doesn't exist in Sleeper's player database anymore
// — a partially-resolved trade (silently dropping missing players) would be
// misleading, so an unresolvable ID invalidates the whole link.
function resolveDisplayPlayers(
  items: TradeSidePlayer[],
  allPlayers: PlayersById
): DisplayPlayer[] | null {
  const resolved: DisplayPlayer[] = [];
  for (const item of items) {
    const player = allPlayers[item.sleeperId];
    if (!player) return null;
    resolved.push({
      sleeperId: item.sleeperId,
      name: getPlayerName(item.sleeperId, allPlayers),
      position: player.position ?? "-",
      team: player.team ?? null,
      value: item.value,
    });
  }
  return resolved;
}

// Odds, trade value, the trade label, and the verdict itself all come
// straight from the frozen payload — captured once at share time in
// trade-analyzer.tsx's handleShare() (see lib/verdict-share.ts). Nothing
// here re-runs getOddsForTrade()/computeTradeVerdict()/the Monte Carlo
// simulation. Only cosmetic reference data (player name/position, team
// name/record) resolves live, via getAllPlayers() and a plain roster/user
// lookup — both already cached at the lib layer, so there's no real
// simulation work left to dedupe across generateMetadata/the page/
// opengraph-image, and this doesn't need React.cache() wrapping like the
// old simulation-backed version did.
export async function loadVerdictView(code: string): Promise<VerdictView | null> {
  const payload = decodeVerdict(code);
  if (!payload) return null;

  const [rosters, users, allPlayers] = await Promise.all([
    getRosters(payload.leagueId),
    getUsers(payload.leagueId),
    getAllPlayers(),
  ]);

  const roster = rosters.find((r) => r.roster_id === payload.rosterId);
  if (!roster) return null;
  const owner = roster.owner_id ? users.find((u) => u.user_id === roster.owner_id) : undefined;

  const givePlayers = resolveDisplayPlayers(payload.give, allPlayers);
  const receivePlayers = resolveDisplayPlayers(payload.receive, allPlayers);
  if (!givePlayers || !receivePlayers) return null;

  const team: TeamContext = {
    rosterId: payload.rosterId,
    teamName: getTeamName(owner),
    ownerName: owner?.display_name ?? "Unassigned",
    record: getRecord(roster),
    bucket: payload.team.bucket,
    thinPositions: payload.team.thinPositions,
    rosterPlayerIds: [],
  };

  return {
    leagueId: payload.leagueId,
    team,
    givePlayers,
    receivePlayers,
    giveTotal: givePlayers.reduce((sum, player) => sum + player.value, 0),
    receiveTotal: receivePlayers.reduce((sum, player) => sum + player.value, 0),
    payload,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const view = await loadVerdictView(code);

  if (!view) {
    return {
      title: "Trade Verdict | Front Office",
      description: "This trade link isn't valid.",
    };
  }

  const title = `${view.payload.tradeLabel} — ${view.team.teamName}`;
  const description = `See how this trade moves ${view.team.teamName}'s value and playoff odds, from the Front Office trade analyzer.`;

  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function VerdictPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const view = await loadVerdictView(code);

  if (!view) {
    return <InvalidTradeLink />;
  }

  const { leagueId, team, givePlayers, receivePlayers, giveTotal, receiveTotal, payload } = view;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black sm:px-6 sm:py-16">
      <main className="flex w-full max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted-foreground">Front Office</p>
          <h1 className="text-3xl font-semibold tracking-tight">Trade Verdict</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            A shared trade from the FantasyCalc-powered trade analyzer.
          </p>
        </div>

        <Separator />

        <p className="text-center text-4xl font-bold tracking-tight sm:text-5xl">
          {payload.tradeLabel}
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="font-medium">{team.teamName}</p>
              <p className="text-sm text-muted-foreground">{team.record}</p>
            </div>
          </div>

          <TeamContextLine team={team} verdict={payload.verdict} />
          <OddsDiffLine odds={payload.odds} tone={payload.verdict.tone} isPending={false} />

          <Verdict verdict={payload.verdict} hasPlayers isPending={false} />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <PlayerListCard title="Sends" players={givePlayers} total={giveTotal} />
          <PlayerListCard title="Receives" players={receivePlayers} total={receiveTotal} />
        </div>

        <Link
          href={`/${leagueId}/trade`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Try your own trade →
        </Link>
      </main>
    </div>
  );
}

function PlayerListCard({
  title,
  players,
  total,
}: {
  title: string;
  players: DisplayPlayer[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <span className="text-lg font-semibold tabular-nums">{total.toLocaleString()}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {players.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No players</p>
        ) : (
          players.map((player) => (
            <div
              key={player.sleeperId}
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{player.name}</p>
                <p className="text-xs text-muted-foreground">
                  {player.position} · {player.team ?? "FA"}
                </p>
              </div>
              <span className="text-sm font-medium tabular-nums">
                {player.value.toLocaleString()}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function InvalidTradeLink() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center dark:bg-black">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          This trade link isn&apos;t valid
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          It may be malformed, or reference a team or player that no longer exists.
        </p>
        <Link
          href="/"
          className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Try your own trade →
        </Link>
      </div>
    </div>
  );
}
