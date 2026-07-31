"use client";

import { useCallback, useSyncExternalStore } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CoManagerAdvice } from "@/components/co-manager-advice";
import type { PlayoffBucket } from "@/lib/team-context";

export interface TeamSummary {
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatarUrl?: string;
  record: string;
  pointsFor: number;
  pointsAgainst: number;
  playoffOdds: number;
  bucket: PlayoffBucket;
  recordRank: number;
  pfRank: number;
}

const TEAM_CHANGE_EVENT = "front-office:team-change";

// Scoped by leagueId so picking a team in one league doesn't leak into
// another league's session. Must match the key built by
// lib/team-selection.ts.
function buildStorageKey(leagueId: string): string {
  return `front-office:my-team:${leagueId}`;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(TEAM_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TEAM_CHANGE_EVENT, callback);
  };
}

function getServerSnapshot(): string | null {
  return null;
}

// Uniform brand-gold across all three bucket states — replaces the
// earlier per-bucket tone scheme (green/amber/neutral), which was a
// placeholder pending the real brand color. The odds-number tone below
// still differentiates by bucket; only the badge itself is gold now.
const BUCKET_BADGE_CLASSES = "border-brand-gold/30 text-brand-gold";

const BUCKET_ODDS_CLASSES: Record<PlayoffBucket, string> = {
  "Playoff Favorite": "text-emerald-600 dark:text-emerald-400",
  "Playoff Contender": "text-amber-600 dark:text-amber-400",
  "Playoff Hopeful": "text-copy-bright",
};

const BUCKET_LABEL: Record<PlayoffBucket, string> = {
  "Playoff Favorite": "Favorite",
  "Playoff Contender": "Contender",
  "Playoff Hopeful": "Hopeful",
};

// "1" -> "1st", "2" -> "2nd", "13" -> "13th", etc. Duplicated from
// lib/team-advice.ts's identical helper per this codebase's established
// per-module convention for small generic helpers.
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TeamDashboard({
  teams,
  leagueId,
}: {
  teams: TeamSummary[];
  leagueId: string;
}) {
  const storageKey = buildStorageKey(leagueId);
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(storageKey),
    [storageKey]
  );
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selectedId = stored ? Number(stored) : null;

  function selectTeam(rosterId: number) {
    window.localStorage.setItem(storageKey, String(rosterId));
    window.dispatchEvent(new Event(TEAM_CHANGE_EVENT));
  }

  function changeTeam() {
    window.localStorage.removeItem(storageKey);
    window.dispatchEvent(new Event(TEAM_CHANGE_EVENT));
  }

  const selectedTeam = teams.find((team) => team.rosterId === selectedId);

  if (selectedTeam) {
    return (
      <Card className="bg-surface-1">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={selectedTeam.avatarUrl} />
              <AvatarFallback>{initials(selectedTeam.teamName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 items-center gap-2">
              <CardTitle className="text-base font-medium">
                {selectedTeam.teamName}
              </CardTitle>
              <Badge variant="outline" className={BUCKET_BADGE_CLASSES}>
                {BUCKET_LABEL[selectedTeam.bucket]}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={changeTeam}>
              Change team
            </Button>
          </div>
          <CardDescription>{selectedTeam.ownerName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-1 py-4 text-center">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Playoff Odds
            </p>
            <p
              className={`text-4xl font-medium tabular-nums ${BUCKET_ODDS_CLASSES[selectedTeam.bucket]}`}
            >
              {(selectedTeam.playoffOdds * 100).toFixed(1)}
              <span className="text-brand-gold">%</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <RankTile label="Record Rank" rank={selectedTeam.recordRank} />
            <RankTile label="Points Rank" rank={selectedTeam.pfRank} />
          </div>

          <div className="border-t border-surface-hairline pt-6">
            <CoManagerAdvice leagueId={leagueId} rosterId={selectedTeam.rosterId} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Pick your team to get started.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <Card
            key={team.rosterId}
            role="button"
            tabIndex={0}
            onClick={() => selectTeam(team.rosterId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") selectTeam(team.rosterId);
            }}
            className="cursor-pointer transition-colors hover:bg-muted/50"
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={team.avatarUrl} />
                  <AvatarFallback>{initials(team.teamName)}</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle>{team.teamName}</CardTitle>
                  <CardDescription>{team.ownerName}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RankTile({ label, rank }: { label: string; rank: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-2 py-3 text-center">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="text-lg font-medium text-copy-bright tabular-nums">
        {ordinal(rank)}
      </div>
    </div>
  );
}
