"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TradeablePlayer } from "@/lib/fantasycalc";

const RESULT_LIMIT = 8;

type Side = "give" | "receive";

export function TradeAnalyzer({ players }: { players: TradeablePlayer[] }) {
  const [giveIds, setGiveIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);

  const playersById = useMemo(
    () => new Map(players.map((player) => [player.sleeperId, player])),
    [players]
  );
  const selectedIds = useMemo(
    () => new Set([...giveIds, ...receiveIds]),
    [giveIds, receiveIds]
  );

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

  return (
    <div className="flex flex-col gap-8">
      <Verdict diff={diff} hasPlayers={hasPlayers} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TradeColumn
          title="You Give"
          players={players}
          selectedIds={selectedIds}
          sideIds={giveIds}
          playersById={playersById}
          total={giveTotal}
          onAdd={(id) => addPlayer("give", id)}
          onRemove={(id) => removePlayer("give", id)}
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
}: {
  title: string;
  players: TradeablePlayer[];
  selectedIds: Set<string>;
  sideIds: string[];
  playersById: Map<string, TradeablePlayer>;
  total: number;
  onAdd: (sleeperId: string) => void;
  onRemove: (sleeperId: string) => void;
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
        <PlayerPicker players={players} excludeIds={selectedIds} onSelect={onAdd} />

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
