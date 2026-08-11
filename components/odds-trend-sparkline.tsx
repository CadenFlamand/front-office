"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { getOddsTrendHistory } from "@/lib/odds-trend-action";
import { useStoredRosterId } from "@/lib/team-selection";

// Fixed mark specs (see the dataviz skill's marks-and-anatomy reference):
// 2px line, round caps, an r=4 (8px) end-marker with a 2px surface-color
// ring. The historical line stays in a de-emphasis tone — only the latest
// point gets the brand accent — rather than color-coding the whole line by
// direction; the signed delta caption below is what actually carries
// direction, in the same emerald/red this app already uses everywhere else
// (OddsDiffLine, the bucket odds tiles), so this doesn't invent a third way
// to say "up" or "down."
const WIDTH = 260;
const HEIGHT = 48;
const PADDING = 8; // clearance so the end-marker's ring never clips the viewBox

function buildLinePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function Sparkline({ history }: { history: { week: number; playoffOdds: number }[] }) {
  const values = history.map((h) => h.playoffOdds);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Auto-scaled to this team's own range, not a fixed 0-100 — a sparkline's
  // job is shape/trend, not absolute cross-team comparison, and scaling to
  // 0-100 would flatten every early-season line (which moves by single-digit
  // points) into a visually dead flat line even when it isn't one.
  const span = max - min || 1; // flat series (every value identical): avoid /0, just center the line

  const innerWidth = WIDTH - PADDING * 2;
  const innerHeight = HEIGHT - PADDING * 2;
  const points = history.map((h, i) => ({
    x: PADDING + (history.length > 1 ? (i / (history.length - 1)) * innerWidth : innerWidth / 2),
    y: PADDING + innerHeight - ((h.playoffOdds - min) / span) * innerHeight,
  }));
  const latest = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-12 w-full overflow-visible"
      role="img"
      aria-label={`Playoff odds trend over the last ${history.length} weeks`}
    >
      <path
        d={buildLinePath(points)}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={latest.x} cy={latest.y} r={6} fill="var(--surface-1, var(--card))" />
      <circle cx={latest.x} cy={latest.y} r={4} fill="var(--brand-gold)">
        <title>{`Week ${history[history.length - 1].week}: ${(history[history.length - 1].playoffOdds * 100).toFixed(1)}%`}</title>
      </circle>
    </svg>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-2 text-center text-sm text-muted-foreground">{children}</p>
  );
}

export function OddsTrendSparkline({ leagueId }: { leagueId: string }) {
  const rosterId = useStoredRosterId(leagueId);
  const [history, setHistory] = useState<{ week: number; playoffOdds: number }[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    startTransition(async () => {
      setHistory(null);
      if (rosterId === null) return;
      try {
        const result = await getOddsTrendHistory(leagueId, rosterId);
        // A newer request may have started (and resolved) while this one
        // was in flight — ignore this response so a stale team's history
        // can't overwrite a fresher one, same guard every other on-demand
        // dashboard card already uses (CoManagerAdvice, TeamRosterCard).
        if (requestId.current !== id) return;
        setHistory(result);
      } catch {
        if (requestId.current !== id) return;
        setHistory(null);
      }
    });
  }, [leagueId, rosterId]);

  return (
    <Card className="bg-surface-1">
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Playoff Odds Trend
        </p>

        {rosterId === null ? (
          <EmptyState>Pick a team to see their odds trend.</EmptyState>
        ) : isPending && history === null ? (
          <div className="h-12" aria-hidden="true" />
        ) : !history || history.length < 2 ? (
          <EmptyState>
            Not enough history yet — check back after next week&apos;s snapshot.
          </EmptyState>
        ) : (
          <>
            <Sparkline history={history} />
            <OddsTrendCaption history={history} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OddsTrendCaption({ history }: { history: { week: number; playoffOdds: number }[] }) {
  const first = history[0];
  const last = history[history.length - 1];
  const delta = last.playoffOdds - first.playoffOdds;
  const deltaClass =
    delta > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : delta < 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-copy-bright tabular-nums">
        {(first.playoffOdds * 100).toFixed(1)}% <span className="text-muted-foreground">→</span>{" "}
        {(last.playoffOdds * 100).toFixed(1)}%
      </span>
      <span className={`tabular-nums ${deltaClass}`}>
        ({delta >= 0 ? "+" : ""}
        {(delta * 100).toFixed(1)})
      </span>
    </div>
  );
}
