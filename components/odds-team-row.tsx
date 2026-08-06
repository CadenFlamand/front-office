"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamRosterCard } from "@/components/team-roster";
import type { PlayoffOddsResult } from "@/lib/playoff-odds";

export function OddsTeamRow({
  leagueId,
  rank,
  result,
}: {
  leagueId: string;
  rank: number;
  result: PlayoffOddsResult;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <button
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 text-left"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span className="w-5 text-sm font-medium text-muted-foreground">{rank}</span>
          <CardTitle className="flex-1">{result.teamName}</CardTitle>
          <Badge variant="default" className="tabular-nums">
            {(result.playoffOdds * 100).toFixed(1)}%
          </Badge>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          <TeamRosterCard leagueId={leagueId} rosterId={result.rosterId} />
        </CardContent>
      )}
    </Card>
  );
}
