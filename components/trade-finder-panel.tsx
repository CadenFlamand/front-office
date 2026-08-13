"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, ChevronDown, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  findWinWinTrades,
  type SuggestedPlayer,
  type WinWinSuggestion,
} from "@/lib/trade-finder-action";

// Same emerald the trade Verdict, OddsDiffLine and TeamContextLine already
// use for a positive outcome, so a suggestion reads as part of that system
// rather than introducing a second "good news" colour.
const POSITIVE_TEXT = "text-emerald-600 dark:text-emerald-400";

const COLLAPSED_SUGGESTIONS = 3;

export function TradeFinderPanel({
  leagueId,
  rosterId,
  onLoadTrade,
}: {
  leagueId: string;
  rosterId: number | null;
  onLoadTrade: (partnerRosterId: number, giveIds: string[], receiveIds: string[]) => void;
}) {
  const [suggestions, setSuggestions] = useState<WinWinSuggestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function findTrades() {
    if (rosterId === null) return;
    startTransition(async () => {
      try {
        const result = await findWinWinTrades(leagueId, rosterId);
        setSuggestions(result);
        setExpanded(false);
        setFailed(false);
      } catch {
        setSuggestions(null);
        setFailed(true);
      }
    });
  }

  const hasRun = suggestions !== null;
  // A dozen full-height cards buried the analyzer itself roughly 4,000px down
  // the page, so only the strongest few are shown until asked for.
  const visibleCount = expanded ? Number.POSITIVE_INFINITY : COLLAPSED_SUGGESTIONS;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Button disabled={rosterId === null || isPending} onClick={findTrades}>
            {isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isPending ? "Searching…" : hasRun ? "Search again" : "Find me a trade"}
          </Button>
          <p className="max-w-md text-sm text-muted-foreground">
            {rosterId === null
              ? "Select your team above to search for trades."
              : "Scans every team in your league for trades that help both sides."}
          </p>
        </div>

        {isPending && <SearchingState />}

        {!isPending && failed && (
          <p className="text-center text-sm text-muted-foreground">
            Couldn&apos;t search for trades right now.{" "}
            <button
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={findTrades}
              type="button"
            >
              Try again
            </button>
          </p>
        )}

        {!isPending && hasRun && suggestions.length === 0 && (
          <p className="rounded-lg border py-6 text-center text-sm text-muted-foreground">
            No win-win trades available right now. That usually means your roster has
            no clear surplus to trade from, or nobody who needs it has a fair price.
          </p>
        )}

        {!isPending && hasRun && suggestions.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
            </p>
            {suggestions.slice(0, visibleCount).map((suggestion, index) => (
              <SuggestionCard
                key={`${suggestion.partnerRosterId}-${index}`}
                onLoad={() =>
                  onLoadTrade(
                    suggestion.partnerRosterId,
                    suggestion.give.map((player) => player.sleeperId),
                    suggestion.receive.map((player) => player.sleeperId)
                  )
                }
                suggestion={suggestion}
              />
            ))}
            {suggestions.length > visibleCount && (
              <Button
                className="self-center"
                onClick={() => setExpanded(true)}
                size="sm"
                variant="ghost"
              >
                Show {suggestions.length - visibleCount} more
                <ChevronDown />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// The funnel takes roughly one to two seconds — long enough that a bare
// spinner reads as a stall, so the skeletons show the shape of what's coming.
function SearchingState() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted-foreground">
        Checking trades across the league…
      </p>
      {[0, 1].map((key) => (
        <div className="flex flex-col gap-3 rounded-lg border p-4" key={key}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full max-w-sm" />
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onLoad,
}: {
  suggestion: WinWinSuggestion;
  onLoad: () => void;
}) {
  const shape = `${suggestion.give.length}-for-${suggestion.receive.length}`;
  const clears = [
    ...suggestion.myClears.map((flag) => `${flag} for you`),
    ...suggestion.partnerClears.map((flag) => `${flag} for them`),
  ];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-emerald-600/40 bg-emerald-500/5 p-4 dark:border-emerald-400/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className={`flex items-center gap-1.5 font-semibold ${POSITIVE_TEXT}`}>
            <Check aria-hidden="true" className="size-4 shrink-0" />
            {suggestion.assessment.label}
          </p>
          <p className="text-sm text-muted-foreground">{suggestion.assessment.detail}</p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {shape}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PlayerSide label="You give" players={suggestion.give} />
        <PlayerSide label="You receive" players={suggestion.receive} />
      </div>

      <div className="flex flex-col gap-1 border-t border-emerald-600/20 pt-3 text-sm dark:border-emerald-400/15">
        <OddsRow
          after={suggestion.myOddsAfter}
          before={suggestion.myOddsBefore}
          label="You"
        />
        <OddsRow
          after={suggestion.partnerOddsAfter}
          before={suggestion.partnerOddsBefore}
          label={suggestion.partnerTeamName}
        />
      </div>

      {clears.length > 0 && (
        <p className="text-xs text-muted-foreground">Clears {clears.join(" · ")}</p>
      )}

      <Button className="self-start" onClick={onLoad} size="sm" variant="outline">
        Load into analyzer
        <ArrowRight />
      </Button>
    </div>
  );
}

function PlayerSide({ label, players }: { label: string; players: SuggestedPlayer[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {players.map((player) => (
        <div
          className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5"
          key={player.sleeperId}
        >
          <span className="min-w-0 flex-1 truncate text-sm">
            {player.name}{" "}
            <span className="text-xs text-muted-foreground">
              {player.position} · {player.team ?? "FA"}
            </span>
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {player.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function OddsRow({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}) {
  const delta = (after - before) * 100;
  // A needs-based suggestion is allowed a small negative swing (the odds
  // impact just isn't what qualified it), so this can't assume positive.
  const deltaClass = delta > 0 ? POSITIVE_TEXT : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="font-mono shrink-0 tabular-nums">
        {(before * 100).toFixed(1)}% <span className="text-muted-foreground">→</span>{" "}
        <span className="font-medium">{(after * 100).toFixed(1)}%</span>{" "}
        <span className={deltaClass}>
          ({delta >= 0 ? "+" : ""}
          {delta.toFixed(1)})
        </span>
      </span>
    </div>
  );
}
