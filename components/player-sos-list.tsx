"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { SosTierBadge } from "@/components/sos-tier-badge";
import { getTeamSos, type PlayerSosEntry } from "@/lib/sos-action";

// Season-long SOS for the team's current starters only, per spec — the
// near-term trade-timing signal for these same players surfaces instead
// through Stage 2 co-manager advice (CoManagerAdvice, rendered alongside
// this component), not duplicated here.
export function PlayerSosList({ leagueId, rosterId }: { leagueId: string; rosterId: number }) {
  const [entries, setEntries] = useState<PlayerSosEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    startTransition(async () => {
      setEntries(null);
      try {
        const result = await getTeamSos(leagueId, rosterId);
        // A newer request may have started (and resolved) while this one
        // was in flight — ignore this response so a stale team's SOS list
        // can't overwrite a fresher one.
        if (requestId.current !== id) return;
        setEntries(result);
      } catch {
        if (requestId.current !== id) return;
        setEntries(null);
      }
    });
  }, [leagueId, rosterId]);

  if (isPending && !entries) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading strength of schedule…
      </div>
    );
  }

  if (!entries || entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <p className="font-heading text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Strength of Schedule
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {entries.map((entry) => (
          <li key={entry.sleeperId} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {entry.name}{" "}
              <span className="text-xs text-muted-foreground">{entry.position}</span>
            </span>
            <SosTierBadge window={entry.sos.seasonLong} />
          </li>
        ))}
      </ul>
    </div>
  );
}
