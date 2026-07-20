"use client";

import { useSyncExternalStore } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface TeamSummary {
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatarUrl?: string;
  record: string;
  pointsFor: number;
  pointsAgainst: number;
}

const STORAGE_KEY = "front-office:my-team";
const TEAM_CHANGE_EVENT = "front-office:team-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(TEAM_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TEAM_CHANGE_EVENT, callback);
  };
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
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

export function TeamDashboard({ teams }: { teams: TeamSummary[] }) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selectedId = stored ? Number(stored) : null;

  function selectTeam(rosterId: number) {
    window.localStorage.setItem(STORAGE_KEY, String(rosterId));
    window.dispatchEvent(new Event(TEAM_CHANGE_EVENT));
  }

  function changeTeam() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(TEAM_CHANGE_EVENT));
  }

  const selectedTeam = teams.find((team) => team.rosterId === selectedId);

  if (selectedTeam) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={selectedTeam.avatarUrl} />
              <AvatarFallback>{initials(selectedTeam.teamName)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-xl">{selectedTeam.teamName}</CardTitle>
              <CardDescription>{selectedTeam.ownerName}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={changeTeam}>
              Change team
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8">
            <Stat label="Record" value={selectedTeam.record} />
            <Stat label="Points For" value={selectedTeam.pointsFor.toFixed(2)} />
            <Stat
              label="Points Against"
              value={selectedTeam.pointsAgainst.toFixed(2)}
            />
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
