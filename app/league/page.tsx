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
import {
  getAllPlayers,
  getAvatarUrl,
  getLeague,
  getPlayerName,
  getRecord,
  getRosters,
  getTeamName,
  getUsers,
  type SleeperRoster,
} from "@/lib/sleeper";

export const metadata = {
  title: "League | Front Office",
};

function winPct(roster: SleeperRoster): number {
  const { wins = 0, losses = 0, ties = 0 } = roster.settings ?? {};
  const games = wins + losses + ties;
  return games === 0 ? 0 : (wins + ties * 0.5) / games;
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

interface RosterSlot {
  label: string;
  playerId: string;
}

function getStarterSlots(
  roster: SleeperRoster,
  rosterPositions: string[]
): RosterSlot[] {
  const startingLabels = rosterPositions.filter((pos) => pos !== "BN");
  const starters = roster.starters ?? [];
  return startingLabels.map((label, i) => ({
    label,
    playerId: starters[i] ?? "",
  }));
}

function getBenchPlayerIds(roster: SleeperRoster): string[] {
  const starters = new Set(roster.starters ?? []);
  return (roster.players ?? []).filter((id) => !starters.has(id));
}

export default async function LeaguePage() {
  const [league, rosters, users, players] = await Promise.all([
    getLeague(),
    getRosters(),
    getUsers(),
    getAllPlayers(),
  ]);

  const usersById = new Map(users.map((user) => [user.user_id, user]));

  const sortedRosters = [...rosters].sort((a, b) => {
    const pctDiff = winPct(b) - winPct(a);
    if (pctDiff !== 0) return pctDiff;
    return (b.settings?.fpts ?? 0) - (a.settings?.fpts ?? 0);
  });

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {league.name}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {league.season} season &middot; {league.total_rosters} teams
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-6">
          {sortedRosters.map((roster, index) => {
            const owner = roster.owner_id
              ? usersById.get(roster.owner_id)
              : undefined;
            const teamName = getTeamName(owner);
            const starterSlots = getStarterSlots(
              roster,
              league.roster_positions
            );
            const benchIds = getBenchPlayerIds(roster);

            return (
              <Card key={roster.roster_id}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-sm font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <Avatar>
                      <AvatarImage src={getAvatarUrl(owner?.avatar ?? null)} />
                      <AvatarFallback>{initials(teamName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <div>
                        <CardTitle>{teamName}</CardTitle>
                        {owner?.display_name && (
                          <CardDescription>
                            {owner.display_name}
                          </CardDescription>
                        )}
                      </div>
                      <Badge variant="secondary">{getRecord(roster)}</Badge>
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
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
