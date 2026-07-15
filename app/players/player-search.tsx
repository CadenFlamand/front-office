"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { PlayerSummary } from "./data";

const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
const RESULT_LIMIT = 100;

function displayValue(value: string | null, fallback = "—") {
  return value?.trim() || fallback;
}

function statusLabel(status: string | null) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

export function PlayerSearch({ players }: { players: PlayerSummary[] }) {
  const [query, setQuery] = useState("");
  const [includeAll, setIncludeAll] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

  const matches = useMemo(() => {
    return players.filter((player) => {
      const isFantasyRelevant =
        player.position !== null && FANTASY_POSITIONS.has(player.position);
      const matchesPosition = includeAll || isFantasyRelevant;
      const matchesName =
        deferredQuery.length === 0 ||
        player.name.toLocaleLowerCase().includes(deferredQuery);

      return matchesPosition && matchesName;
    });
  }, [deferredQuery, includeAll, players]);

  const visiblePlayers = matches.slice(0, RESULT_LIMIT);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search NFL players by name</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            autoComplete="off"
            autoFocus
            className="h-11 w-full rounded-lg border bg-background pr-4 pl-10 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search players (try “jefferson”)"
            type="search"
            value={query}
          />
        </label>

        <button
          aria-pressed={includeAll}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setIncludeAll((current) => !current)}
          type="button"
        >
          <span
            aria-hidden="true"
            className={`relative h-5 w-9 rounded-full transition-colors ${
              includeAll ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${
                includeAll ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </span>
          Include all positions
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <p aria-live="polite">
          {matches.length.toLocaleString()} {matches.length === 1 ? "player" : "players"}
        </p>
        {matches.length > RESULT_LIMIT && (
          <p>Showing first {RESULT_LIMIT}</p>
        )}
      </div>

      {visiblePlayers.length > 0 ? (
        <Card className="gap-0 py-0">
          <div className="hidden grid-cols-[minmax(0,1fr)_5rem_5rem_7rem_7rem] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
            <span>Player</span>
            <span>Position</span>
            <span>Team</span>
            <span>Injury</span>
            <span>Status</span>
          </div>
          <CardContent className="divide-y px-0">
            {visiblePlayers.map((player) => (
              <div
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_7rem_7rem] sm:items-center"
                key={player.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{player.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                    {displayValue(player.position)} · {displayValue(player.team, "FA")}
                  </p>
                </div>
                <Badge className="hidden w-fit sm:inline-flex" variant="outline">
                  {displayValue(player.position)}
                </Badge>
                <span className="hidden text-sm sm:block">
                  {displayValue(player.team, "FA")}
                </span>
                <div>
                  {player.injuryStatus ? (
                    <Badge variant="destructive">{player.injuryStatus}</Badge>
                  ) : (
                    <span className="hidden text-sm text-muted-foreground sm:inline">Healthy</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground sm:text-sm">
                  {statusLabel(player.status)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">No players found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another name or include all positions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
