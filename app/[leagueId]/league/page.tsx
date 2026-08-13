import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getManualLeague, getManualRosters, getManualTeams } from "@/lib/db/manual-leagues";
import { isNotFound } from "@/lib/http";
import {
  computeManualStandingsRanks,
  formatManualRecord,
  isManualLeagueId,
} from "@/lib/manual-league";
import { getLeagueData } from "@/lib/league-data";
import {
  formatRecord,
  managerTeamName,
  type LeagueRoster,
} from "@/lib/league-types";
import { getPlayoffOdds } from "@/lib/playoff-odds";
import { getAllPlayers, getPlayerName } from "@/lib/sleeper";

export const metadata = {
  title: "League | Front Office",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface RosterSlot {
  label: string;
  playerId: string;
}

function getStarterSlots(
  roster: LeagueRoster,
  rosterPositions: string[]
): RosterSlot[] {
  // IR is a reserve slot, not a lineup slot, so it's excluded alongside the
  // bench — otherwise an ESPN league's IR spots would show up as trailing
  // "Empty" starter rows.
  const startingLabels = rosterPositions.filter((pos) => pos !== "BN" && pos !== "IR");
  return startingLabels.map((label, i) => ({
    label,
    playerId: roster.starters[i] ?? "",
  }));
}

function getBenchPlayerIds(roster: LeagueRoster): string[] {
  const starters = new Set(roster.starters);
  return roster.players.filter((id) => !starters.has(id));
}

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  if (isManualLeagueId(leagueId)) {
    const league = await getManualLeague(leagueId);
    if (!league) notFound();

    const [manualTeams, rosters, allPlayers] = await Promise.all([
      getManualTeams(leagueId),
      getManualRosters(leagueId),
      getAllPlayers(),
    ]);

    const rankByTeamId = computeManualStandingsRanks(manualTeams);
    const sortedTeams = [...manualTeams].sort(
      (a, b) => (rankByTeamId.get(a.id) ?? 0) - (rankByTeamId.get(b.id) ?? 0)
    );

    return (
      <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
        <div className="flex w-full max-w-3xl flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">{league.name}</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              Manually-entered league · {manualTeams.length} teams
            </p>
          </div>

          <Separator />

          <div className="flex flex-col gap-6">
            {sortedTeams.map((team, index) => {
              const playerIds = rosters.get(team.id) ?? [];
              return (
                <Card key={team.id}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-sm font-medium text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="flex flex-1 items-center justify-between gap-2">
                        <CardTitle>{team.teamName}</CardTitle>
                        <Badge variant="secondary">{formatManualRecord(team)}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <RosterSection title="Roster">
                      {playerIds.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No players yet.</p>
                      ) : (
                        playerIds.map((id) => (
                          <PlayerRow
                            key={id}
                            label={allPlayers[id]?.position ?? "-"}
                            name={getPlayerName(id, allPlayers)}
                          />
                        ))
                      )}
                    </RosterSection>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  let leagueData, players, playoffOdds;
  try {
    [leagueData, players, playoffOdds] = await Promise.all([
      getLeagueData(leagueId),
      getAllPlayers(),
      getPlayoffOdds(leagueId),
    ]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }

  const { league, rosters, managers } = leagueData;
  const managersById = new Map(managers.map((manager) => [manager.ownerId, manager]));
  const oddsByRosterId = new Map(playoffOdds.map((o) => [o.rosterId, o.playoffOdds]));

  const sortedRosters = [...rosters].sort((a, b) => {
    const oddsDiff =
      (oddsByRosterId.get(b.rosterId) ?? 0) - (oddsByRosterId.get(a.rosterId) ?? 0);
    if (oddsDiff !== 0) return oddsDiff;
    return b.pointsFor - a.pointsFor;
  });

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {league.name}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {league.season} season &middot; {league.totalRosters} teams
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-6">
          {sortedRosters.map((roster, index) => {
            const manager = roster.ownerId
              ? managersById.get(roster.ownerId)
              : undefined;
            const teamName = managerTeamName(manager);
            const starterSlots = getStarterSlots(
              roster,
              league.rosterPositions
            );
            const benchIds = getBenchPlayerIds(roster);

            return (
              <Card key={roster.rosterId}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-sm font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <Avatar>
                      <AvatarImage src={manager?.avatarUrl} />
                      <AvatarFallback>{initials(teamName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <div>
                        <CardTitle>{teamName}</CardTitle>
                        {manager?.displayName && (
                          <CardDescription>
                            {manager.displayName}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="font-mono tabular-nums">
                          {((oddsByRosterId.get(roster.rosterId) ?? 0) * 100).toFixed(1)}%
                        </Badge>
                        <Badge variant="secondary">{formatRecord(roster)}</Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <RosterSection title="Starters">
                    {starterSlots.map((slot, i) => (
                      <PlayerRow
                        key={`${slot.label}-${i}`}
                        label={slot.label}
                        name={
                          slot.playerId
                            ? getPlayerName(slot.playerId, players)
                            : "Empty"
                        }
                      />
                    ))}
                  </RosterSection>

                  <RosterSection title="Bench">
                    {benchIds.map((id) => (
                      <PlayerRow
                        key={id}
                        label={players[id]?.position ?? "-"}
                        name={getPlayerName(id, players)}
                      />
                    ))}
                  </RosterSection>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RosterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="font-heading mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function PlayerRow({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge variant="outline" className="w-12 shrink-0 justify-center">
        {label}
      </Badge>
      <span>{name}</span>
    </div>
  );
}
