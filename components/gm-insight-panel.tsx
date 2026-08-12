"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Lightbulb } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getRelevantGmInsights, type GmInsightDisplay } from "@/lib/gm-insights-action";
import { useStoredRosterId } from "@/lib/team-selection";

/**
 * Caden's own curated notes for the currently-selected team — stacked below
 * OddsTrendSparkline in the same side panel, same self-fetch-on-selection
 * pattern (useStoredRosterId + on-demand Server Action). Renders nothing
 * (not an empty shell) both before a team is picked and when nothing's
 * relevant, matching the sparkline's "pick a team" gating rather than
 * showing an empty-state message of its own — an empty GM Insight card
 * would read as "there should be something here" when there just isn't.
 */
export function GmInsightPanel({ leagueId }: { leagueId: string }) {
  const rosterId = useStoredRosterId(leagueId);
  const [insights, setInsights] = useState<GmInsightDisplay[] | null>(null);
  const [, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    startTransition(async () => {
      setInsights(null);
      if (rosterId === null) return;
      try {
        const result = await getRelevantGmInsights(leagueId, rosterId);
        // A newer request may have started (and resolved) while this one was
        // in flight — same stale-response guard as OddsTrendSparkline.
        if (requestId.current !== id) return;
        setInsights(result);
      } catch {
        if (requestId.current !== id) return;
        setInsights(null);
      }
    });
  }, [leagueId, rosterId]);

  if (!insights || insights.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {insights.map((insight) => (
        <GmInsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

function GmInsightCard({ insight }: { insight: GmInsightDisplay }) {
  return (
    <Popover>
      <PopoverTrigger className="flex w-full flex-col gap-1.5 rounded-xl bg-surface-1 p-4 text-left ring-1 ring-surface-hairline transition hover:ring-brand-gold/50">
        <InsightLabel playerName={insight.playerName} />
        <p className="truncate text-sm text-copy-bright">{insight.content}</p>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom">
        <InsightLabel playerName={insight.playerName} />
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-copy-bright">
          {insight.content}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function InsightLabel({ playerName }: { playerName: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <Lightbulb className="size-3.5 shrink-0 text-brand-gold" aria-hidden="true" />
      <span className="text-xs font-medium tracking-wide text-brand-gold uppercase">
        GM Insight
      </span>
      {playerName && (
        <span className="ml-auto truncate text-xs text-muted-foreground">{playerName}</span>
      )}
    </div>
  );
}
