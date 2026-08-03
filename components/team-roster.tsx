"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { isManualLeagueId } from "@/lib/manual-league";
import { getManualTeamRoster } from "@/lib/manual-roster-action";
import { getTeamRoster, type RosterPlayer, type TeamRoster } from "@/lib/roster-action";

export function TeamRosterCard({
  leagueId,
  rosterId,
}: {
  leagueId: string;
  rosterId: number;
}) {
  const [roster, setRoster] = useState<TeamRoster | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const manual = isManualLeagueId(leagueId);

  useEffect(() => {
    const id = ++requestId.current;
    startTransition(async () => {
      setRoster(null);
      try {
        // Manual leagues have no starters/bench split (no real weekly
        // lineup data) — a flat list is stashed in `starters` and `bench`
        // stays empty; the Bench section is hidden entirely below rather
        // than rendered empty.
        const result = manual
          ? { starters: await getManualTeamRoster(rosterId), bench: [] }
          : await getTeamRoster(leagueId, rosterId);
        // A newer request may have started (and resolved) while this one
        // was in flight — ignore this response so a stale team's roster
        // can't overwrite a fresher one.
        if (requestId.current !== id) return;
        setRoster(result);
      } catch {
        if (requestId.current !== id) return;
        setRoster(null);
      }
    });
  }, [leagueId, rosterId, manual]);

  if (isPending && !roster) {
    return (
      <Card className="bg-surface-1">
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading roster…
        </CardContent>
      </Card>
    );
  }

  if (!roster) return null;

  return (
    <Card className="bg-surface-1">
      <CardContent className="flex flex-col gap-6">
        <RosterSection label={manual ? "Roster" : "Starters"} players={roster.starters} />
        {!manual && (
          <div className="border-t border-surface-hairline pt-6">
            <RosterSection label="Bench" players={roster.bench} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RosterSection({ label, players }: { label: string; players: RosterPlayer[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {players.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No players</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {players.map((player) => (
            <li
              key={player.playerId}
              className="flex items-center justify-between gap-2 text-[13px] text-copy-bright"
            >
              <span className="truncate">{player.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{player.position}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
