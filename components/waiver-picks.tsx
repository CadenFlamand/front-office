"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useStoredRosterId } from "@/lib/team-selection";
import type { TeamContext } from "@/lib/team-context";
import {
  getWaiverRecommendations,
} from "@/lib/waiver-recommendations-action";
import type {
  NeedBasedWaiverRecommendation,
  WaiverRecommendation,
  WaiverRecommendations,
} from "@/lib/waiver-recommendations";

// Same "streaming vs. thin" split co-manager advice's dots already use for
// these exact positions — duplicated rather than imported (that function
// isn't exported from lib/team-advice-format.ts, and this is a one-line
// rule, same "small pure logic, don't couple modules for it" convention
// this codebase already applies to bigger things).
function positionSignalClass(position: string): string {
  return position === "QB" || position === "TE" ? "bg-signal-stream" : "bg-signal-thin";
}

const REASON_LABEL: Record<string, string> = {
  weak: "weak",
  thin: "thin",
};

export function WaiverPicks({
  leagueId,
  teams,
}: {
  leagueId: string;
  teams: TeamContext[];
}) {
  const [sessionRosterId, setSessionRosterId] = useState<number | null>(null);
  const storedRosterId = useStoredRosterId(leagueId);
  const selectedRosterId = storedRosterId ?? sessionRosterId;
  const selectedTeam = teams.find((team) => team.rosterId === selectedRosterId);

  const [recommendations, setRecommendations] = useState<WaiverRecommendations | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    startTransition(async () => {
      if (selectedRosterId === null) {
        setRecommendations(null);
        return;
      }
      try {
        const result = await getWaiverRecommendations(leagueId, selectedRosterId);
        if (requestId.current !== id) return;
        setRecommendations(result);
      } catch {
        if (requestId.current !== id) return;
        setRecommendations(null);
      }
    });
  }, [leagueId, selectedRosterId]);

  if (!selectedTeam) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
        <label className="text-sm font-medium" htmlFor="waivers-team-select">
          Select your team (for this session only)
        </label>
        <select
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          defaultValue=""
          id="waivers-team-select"
          onChange={(event) =>
            setSessionRosterId(event.target.value ? Number(event.target.value) : null)
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

  if (isPending && !recommendations) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading waiver rankings…
      </div>
    );
  }

  if (!recommendations) {
    return (
      <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
        Couldn&apos;t load waiver recommendations right now.
      </p>
    );
  }

  if (!recommendations.hasWaiverData) {
    return (
      <p className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
        No waiver rankings published yet this season — FantasyPros doesn&apos;t release
        these until real games have been played. Check back after Week 1.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="For Your Team"
        subtitle={
          selectedTeam.thinPositions.length > 0 || recommendations.needBased.length > 0
            ? "Available players at positions you're flagged weak or thin at."
            : "No flagged weak/thin positions right now — nice problem to have."
        }
        emptyMessage="Nothing available right now at a position you need."
        rows={recommendations.needBased}
        renderReasons
      />
      <Section
        title="Best Available"
        subtitle="Top waiver-wire players league-wide, regardless of your needs."
        emptyMessage="No unrostered players in the current rankings."
        rows={recommendations.bestAvailable}
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  emptyMessage,
  rows,
  renderReasons,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  rows: WaiverRecommendation[] | NeedBasedWaiverRecommendation[];
  renderReasons?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="divide-y px-0">
            {rows.map((player, index) => (
              <div
                className="flex items-center gap-3 px-4 py-3"
                key={player.sleeperId}
              >
                <span className="w-6 shrink-0 text-sm font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full ${positionSignalClass(player.position)}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{player.playerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {player.position} · {player.team ?? "FA"}
                  </p>
                </div>
                {renderReasons && "reasons" in player && (
                  <div className="hidden shrink-0 gap-1 sm:flex">
                    {player.reasons.map((reason) => (
                      <Badge key={reason} variant="outline" className="text-xs">
                        {player.position} {REASON_LABEL[reason]}
                      </Badge>
                    ))}
                  </div>
                )}
                <Badge className="shrink-0 tabular-nums" variant="default">
                  #{player.waiverRank}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
