"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type AdviceSignals,
  formatAdviceCompact,
  formatAdviceExpanded,
} from "@/lib/team-advice";
import { getCoManagerAdvice } from "@/lib/team-advice-action";

type Format = "compact" | "expanded";

// Deterministic ~50/50 split per team so each beta tester sees a stable
// default format across visits, without any new analytics/assignment infra
// — the toggle below lets anyone compare the other format directly.
function hashVariant(key: string): Format {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return sum % 2 === 0 ? "compact" : "expanded";
}

export function CoManagerAdvice({
  leagueId,
  rosterId,
}: {
  leagueId: string;
  rosterId: number;
}) {
  const [advice, setAdvice] = useState<AdviceSignals | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const [formatOverride, setFormatOverride] = useState<Format | null>(null);

  useEffect(() => {
    const id = ++requestId.current;
    startTransition(async () => {
      setAdvice(null);
      setFormatOverride(null);
      try {
        const result = await getCoManagerAdvice(leagueId, rosterId);
        // A newer request may have started (and resolved) while this one
        // was in flight — ignore this response so a stale team's advice
        // can't overwrite a fresher one.
        if (requestId.current !== id) return;
        setAdvice(result);
      } catch {
        if (requestId.current !== id) return;
        setAdvice(null);
      }
    });
  }, [leagueId, rosterId]);

  if (isPending && !advice) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading advice…
      </div>
    );
  }

  if (!advice) return null;

  const format = formatOverride ?? hashVariant(`${leagueId}:${rosterId}`);
  const compactLine = formatAdviceCompact(advice);
  const expandedLines = formatAdviceExpanded(advice);
  if (!compactLine && expandedLines.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Advice
        </p>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setFormatOverride(format === "compact" ? "expanded" : "compact")}
        >
          {format === "compact" ? "Show more" : "Show less"}
        </Button>
      </div>
      {format === "compact" ? (
        <p className="text-sm">{compactLine}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {expandedLines.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
