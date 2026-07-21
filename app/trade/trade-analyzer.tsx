"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TradeablePlayer } from "@/lib/fantasycalc";
import type { PlayoffBucket, TeamContext } from "@/lib/team-context";
import { useStoredRosterId } from "@/lib/team-selection";
import { getOddsForTrade, type TradeOddsDiff } from "@/lib/trade-odds-action";

const RESULT_LIMIT = 8;

type Side = "give" | "receive";

export function TradeAnalyzer({
  players,
  teams,
}: {
  players: TradeablePlayer[];
  teams: TeamContext[];
}) {
  const [giveIds, setGiveIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);

  // For this session only: if no team is saved via the home page's team
  // picker, let the user pick one here without persisting it.
  const [sessionRosterId, setSessionRosterId] = useState<number | null>(null);
  const storedRosterId = useStoredRosterId();
  const selectedRosterId = storedRosterId ?? sessionRosterId;
  const selectedTeam = teams.find((team) => team.rosterId === selectedRosterId);

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.sleeperId, player])),
    [players]
  );
  const selectedIds = useMemo(
    () => new Set([...giveIds, ...receiveIds]),
    [giveIds, receiveIds]
  );

  // "You Give" is scoped to the selected team's actual roster (already
  // fetched from Sleeper), not the full league player pool — "You Receive"
  // stays a full-league search since you don't necessarily know the other
  // team's roster upfront.
  const rosterPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return selectedTeam.rosterPlayerIds
      .map((id) => playersById.get(id))
      .filter((player): player is TradeablePlayer => player !== undefined);
  }, [selectedTeam, playersById]);

  function addPlayer(side: Side, sleeperId: string) {
    if (side === "give") setGiveIds((ids) => [...ids, sleeperId]);
    else setReceiveIds((ids) => [...ids, sleeperId]);
  }

  function removePlayer(side: Side, sleeperId: string) {
    if (side === "give") setGiveIds((ids) => ids.filter((id) => id !== sleeperId));
    else setReceiveIds((ids) => ids.filter((id) => id !== sleeperId));
  }

  const giveTotal = sumValues(giveIds, playersById);
  const receiveTotal = sumValues(receiveIds, playersById);
  const diff = receiveTotal - giveTotal;
  const hasPlayers = giveIds.length > 0 || receiveIds.length > 0;

  const [odds, setOdds] = useState<TradeOddsDiff | null>(null);
  const [isOddsPending, startOddsTransition] = useTransition();
  const oddsRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++oddsRequestId.current;
    startOddsTransition(async () => {
      if (!selectedRosterId || !hasPlayers) {
        setOdds(null);
        return;
      }
      const result = await getOddsForTrade(selectedRosterId, giveIds, receiveIds);
      // A newer request may have started (and resolved) while this one was
      // in flight — ignore this response so a stale result can't overwrite
      // a fresher one.
      if (requestId === oddsRequestId.current) setOdds(result);
    });
  }, [selectedRosterId, giveIds, receiveIds, hasPlayers, startOddsTransition]);

  return (
    <div className="flex flex-col gap-8">
      <TeamHeader
        teams={teams}
        selectedTeam={selectedTeam}
        isAutoDetected={storedRosterId !== null}
        onSelectSessionTeam={setSessionRosterId}
      />

      <div className="flex flex-col gap-3">
        {selectedTeam && hasPlayers && (
          <>
            <TeamContextLine
              team={selectedTeam}
              diff={diff}
              giveIds={giveIds}
              receiveIds={receiveIds}
              playersById={playersById}
            />
            <OddsDiffLine odds={odds} isPending={isOddsPending} />
          </>
        )}

        <Verdict diff={diff} hasPlayers={hasPlayers} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TradeColumn
          title="You Give"
          players={rosterPlayers}
          selectedIds={selectedIds}
          sideIds={giveIds}
          playersById={playersById}
          total={giveTotal}
          onAdd={(id) => addPlayer("give", id)}
          onRemove={(id) => removePlayer("give", id)}
          showRoster
          disabledMessage={
            !selectedTeam ? "Select your team above to see your roster." : undefined
          }
        />
        <TradeColumn
          title="You Receive"
          players={players}
          selectedIds={selectedIds}
          sideIds={receiveIds}
          playersById={playersById}
          total={receiveTotal}
          onAdd={(id) => addPlayer("receive", id)}
          onRemove={(id) => removePlayer("receive", id)}
        />
      </div>
    </div>
  );
}

function sumValues(ids: string[], playersById: Map<string, TradeablePlayer>): number {
  return ids.reduce((sum, id) => sum + (playersById.get(id)?.value ?? 0), 0);
}

function TeamHeader({
  teams,
  selectedTeam,
  isAutoDetected,
  onSelectSessionTeam,
}: {
  teams: TeamContext[];
  selectedTeam: TeamContext | undefined;
  isAutoDetected: boolean;
  onSelectSessionTeam: (rosterId: number | null) => void;
}) {
  if (selectedTeam) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div>
          <p className="font-medium">{selectedTeam.teamName}</p>
          <p className="text-sm text-muted-foreground">{selectedTeam.record}</p>
        </div>
        {!isAutoDetected && (
          <span className="text-xs text-muted-foreground">This session only</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <label className="text-sm font-medium" htmlFor="trade-team-select">
        Select your team (for this session only)
      </label>
      <select
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        defaultValue=""
        id="trade-team-select"
        onChange={(event) =>
          onSelectSessionTeam(event.target.value ? Number(event.target.value) : null)
        }
      >
        <option disabled value="">
          Choose a team…
        </option>
        {teams.map((team) => (
          <option key={team.rosterId} value={team.rosterId}>
            {team.teamName} — {team.ownerName}
          </option>
        ))}
      </select>
    </div>
  );
}

const BUCKET_GOAL: Record<PlayoffBucket, string> = {
  "Playoff Favorite": "locking up a top playoff seed",
  "Playoff Contender": "making the playoffs",
  "Playoff Hopeful": "a late push",
};

// Strategy framing per bucket (this is redraft, not dynasty, so a bad record
// means "chase upside for the rest of this season," not "rebuild for next
// year"):
//   Favorite:  favor proven/consistent production, avoid unnecessary volatility.
//   Contender: same lean, but open to a calculated risk if it fixes a real hole.
//   Hopeful:   favor ceiling over floor — a safe-but-capped player doesn't move
//              the needle for a team unlikely to make the playoffs.
//
// The current data has no per-player ceiling/floor or volatility signal, so
// this is only expressed as a simple tie-break between "did the trade win on
// raw value" and "did it fix or worsen a real roster hole" — not a full
// player-level model.
function tradeHelpsTeam(
  bucket: PlayoffBucket,
  diff: number,
  holeChange: number
): boolean {
  if (holeChange > 0 && diff >= 0) return true;
  if (holeChange < 0 && diff <= 0) return false;
  if (holeChange !== 0) {
    if (bucket === "Playoff Hopeful") return holeChange > 0;
    if (bucket === "Playoff Favorite") return diff >= 0;
    return diff >= 0 || holeChange > 0;
  }
  return diff >= 0;
}

function countAtPositions(
  ids: string[],
  positions: Set<string>,
  playersById: Map<string, TradeablePlayer>
): number {
  return ids.reduce((count, id) => {
    const player = playersById.get(id);
    return player && positions.has(player.position) ? count + 1 : count;
  }, 0);
}

function TeamContextLine({
  team,
  diff,
  giveIds,
  receiveIds,
  playersById,
}: {
  team: TeamContext;
  diff: number;
  giveIds: string[];
  receiveIds: string[];
  playersById: Map<string, TradeablePlayer>;
}) {
  const thinPositions = useMemo(() => new Set(team.thinPositions), [team]);
  const holeChange =
    countAtPositions(receiveIds, thinPositions, playersById) -
    countAtPositions(giveIds, thinPositions, playersById);
  const helps = tradeHelpsTeam(team.bucket, diff, holeChange);
  const thinSuffix =
    team.thinPositions.length > 0 ? ` thin at ${team.thinPositions.join("/")}` : "";

  return (
    <p className="text-sm text-muted-foreground">
      As a {team.bucket}
      {thinSuffix}, this trade{" "}
      <span
        className={
          helps
            ? "font-medium text-emerald-600 dark:text-emerald-400"
            : "font-medium text-red-600 dark:text-red-400"
        }
      >
        {helps ? "helps" : "hurts"}
      </span>{" "}
      your path to {BUCKET_GOAL[team.bucket]}.
    </p>
  );
}

function OddsDiffLine({
  odds,
  isPending,
}: {
  odds: TradeOddsDiff | null;
  isPending: boolean;
}) {
  if (!odds) {
    if (isPending) {
      return <p className="text-sm text-muted-foreground">Calculating playoff odds…</p>;
    }
    return null;
  }

  const beforePct = odds.before * 100;
  const afterPct = odds.after * 100;
  const deltaPct = afterPct - beforePct;
  const tone = deltaPct > 0.05 ? "positive" : deltaPct < -0.05 ? "negative" : "neutral";
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-foreground";

  return (
    <p className="text-sm text-muted-foreground">
      Playoff odds:{" "}
      <span className="font-medium tabular-nums text-foreground">
        {beforePct.toFixed(1)}%
      </span>{" "}
      →{" "}
      <span className={`font-medium tabular-nums ${toneClass}`}>
        {afterPct.toFixed(1)}%
      </span>{" "}
      <span className={`tabular-nums ${tone === "neutral" ? "text-muted-foreground" : toneClass}`}>
        ({deltaPct >= 0 ? "+" : ""}
        {deltaPct.toFixed(1)} pts)
      </span>
      {isPending && <span className="text-xs text-muted-foreground"> (updating…)</span>}
    </p>
  );
}

function Verdict({ diff, hasPlayers }: { diff: number; hasPlayers: boolean }) {
  let text: string;
  let tone: "positive" | "negative" | "neutral";

  if (!hasPlayers) {
    text = "Add players to both sides to see the verdict.";
    tone = "neutral";
  } else if (diff > 0) {
    text = `You gain +${diff.toLocaleString()} value`;
    tone = "positive";
  } else if (diff < 0) {
    text = `This trade favors the other team by ${Math.abs(diff).toLocaleString()}`;
    tone = "negative";
  } else {
    text = "Dead even trade";
    tone = "neutral";
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-8 text-center">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Verdict
        </p>
        <p
          className={`text-2xl font-semibold ${
            tone === "positive"
              ? "text-emerald-600 dark:text-emerald-400"
              : tone === "negative"
                ? "text-red-600 dark:text-red-400"
                : "text-foreground"
          }`}
        >
          {text}
        </p>
      </CardContent>
    </Card>
  );
}

function TradeColumn({
  title,
  players,
  selectedIds,
  sideIds,
  playersById,
  total,
  onAdd,
  onRemove,
  showRoster,
  disabledMessage,
}: {
  title: string;
  players: TradeablePlayer[];
  selectedIds: Set<string>;
  sideIds: string[];
  playersById: Map<string, TradeablePlayer>;
  total: number;
  onAdd: (sleeperId: string) => void;
  onRemove: (sleeperId: string) => void;
  showRoster?: boolean;
  disabledMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <span className="text-lg font-semibold tabular-nums">
            {total.toLocaleString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {disabledMessage ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {disabledMessage}
          </p>
        ) : (
          <>
            {showRoster && (
              <RosterGrid players={players} excludeIds={selectedIds} onSelect={onAdd} />
            )}
            <PlayerPicker players={players} excludeIds={selectedIds} onSelect={onAdd} />
          </>
        )}

        <div className="flex flex-col gap-2">
          {sideIds.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No players added
            </p>
          )}
          {sideIds.map((id) => {
            const player = playersById.get(id);
            if (!player) return null;
            return (
              <div
                key={id}
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
                <button
                  aria-label={`Remove ${player.name}`}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => onRemove(id)}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RosterGrid({
  players,
  excludeIds,
  onSelect,
}: {
  players: TradeablePlayer[];
  excludeIds: Set<string>;
  onSelect: (sleeperId: string) => void;
}) {
  const available = useMemo(
    () =>
      players
        .filter((player) => !excludeIds.has(player.sleeperId))
        .sort((a, b) => b.value - a.value),
    [players, excludeIds]
  );

  if (available.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        All your tradeable players are already in this trade.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Your Roster
      </p>
      <div className="flex flex-col gap-2">
        {available.map((player) => (
          <button
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
            key={player.sleeperId}
            onClick={() => onSelect(player.sleeperId)}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">
              {player.name}{" "}
              <span className="text-xs text-muted-foreground">
                {player.position} · {player.team ?? "FA"}
              </span>
            </span>
            <Badge variant="outline">{player.value.toLocaleString()}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerPicker({
  players,
  excludeIds,
  onSelect,
}: {
  players: TradeablePlayer[];
  excludeIds: Set<string>;
  onSelect: (sleeperId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

  const matches = useMemo(() => {
    if (deferredQuery.length === 0) return [];
    return players
      .filter(
        (player) =>
          !excludeIds.has(player.sleeperId) &&
          player.name.toLocaleLowerCase().includes(deferredQuery)
      )
      .slice(0, RESULT_LIMIT);
  }, [players, excludeIds, deferredQuery]);

  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">Search players to add</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          autoComplete="off"
          className="h-10 w-full rounded-lg border bg-background pr-4 pl-10 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search players to add…"
          type="search"
          value={query}
        />
      </label>

      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
          {matches.map((player) => (
            <button
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              key={player.sleeperId}
              onClick={() => {
                onSelect(player.sleeperId);
                setQuery("");
              }}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">
                {player.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {player.position} · {player.team ?? "FA"}
                </span>
              </span>
              <Badge variant="outline">{player.value.toLocaleString()}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
