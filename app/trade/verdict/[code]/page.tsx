import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OddsDiffLine, TeamContextLine, Verdict } from "@/app/trade/trade-analyzer";
import type { TradeablePlayer } from "@/lib/fantasycalc";
import { getTeamContexts, type TeamContext } from "@/lib/team-context";
import { getTradeLabel } from "@/lib/trade-label";
import { getOddsForTrade, type TradeOddsDiff } from "@/lib/trade-odds-action";
import { decodeVerdict, type VerdictPayload } from "@/lib/verdict-share";

export const metadata = {
  title: "Trade Verdict | Front Office",
};

interface VerdictData {
  team: TeamContext;
  givePlayers: TradeablePlayer[];
  receivePlayers: TradeablePlayer[];
  giveTotal: number;
  receiveTotal: number;
  diff: number;
  odds: TradeOddsDiff | null;
  playersById: Map<string, TradeablePlayer>;
}

// Resolves every ID to a real player, or null if any single one doesn't
// exist — a partially-resolved trade (silently dropping missing players)
// would be misleading, so an unresolvable ID invalidates the whole link.
function resolvePlayers(
  ids: string[],
  playersById: Map<string, TradeablePlayer>
): TradeablePlayer[] | null {
  const players: TradeablePlayer[] = [];
  for (const id of ids) {
    const player = playersById.get(id);
    if (!player) return null;
    players.push(player);
  }
  return players;
}

async function loadVerdictData(payload: VerdictPayload): Promise<VerdictData | null> {
  const [{ teams, values }, odds] = await Promise.all([
    getTeamContexts(),
    getOddsForTrade(payload.rosterId, payload.giveIds, payload.receiveIds),
  ]);

  const team = teams.find((t) => t.rosterId === payload.rosterId);
  if (!team) return null;

  const playersById = new Map(values.map((player) => [player.sleeperId, player]));
  const givePlayers = resolvePlayers(payload.giveIds, playersById);
  const receivePlayers = resolvePlayers(payload.receiveIds, playersById);
  if (!givePlayers || !receivePlayers) return null;

  const giveTotal = givePlayers.reduce((sum, player) => sum + player.value, 0);
  const receiveTotal = receivePlayers.reduce((sum, player) => sum + player.value, 0);

  return {
    team,
    givePlayers,
    receivePlayers,
    giveTotal,
    receiveTotal,
    diff: receiveTotal - giveTotal,
    odds,
    playersById,
  };
}

export default async function VerdictPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const payload = decodeVerdict(code);
  const data = payload ? await loadVerdictData(payload) : null;

  if (!payload || !data) {
    return <InvalidTradeLink />;
  }

  const { team, givePlayers, receivePlayers, giveTotal, receiveTotal, diff, odds, playersById } =
    data;
  const oddsDelta = odds ? odds.after - odds.before : 0;
  const tradeLabel = getTradeLabel(diff, oddsDelta, receivePlayers);

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

        <p className="text-center text-4xl font-bold tracking-tight sm:text-5xl">{tradeLabel}</p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="font-medium">{team.teamName}</p>
              <p className="text-sm text-muted-foreground">{team.record}</p>
            </div>
          </div>

          <TeamContextLine
            team={team}
            diff={diff}
            giveIds={payload.giveIds}
            receiveIds={payload.receiveIds}
            playersById={playersById}
          />
          <OddsDiffLine odds={odds} isPending={false} />

          <Verdict diff={diff} hasPlayers />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <PlayerListCard title="Sends" players={givePlayers} total={giveTotal} />
          <PlayerListCard title="Receives" players={receivePlayers} total={receiveTotal} />
        </div>

        <Link
          href="/trade"
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
  players: TradeablePlayer[];
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
          href="/trade"
          className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Try your own trade →
        </Link>
      </div>
    </div>
  );
}
