import { notFound } from "next/navigation";

import { TeamDashboard, type TeamSummary } from "@/components/team-dashboard";
import { Separator } from "@/components/ui/separator";
import { getPlayoffOdds } from "@/lib/playoff-odds";
import {
  getAvatarUrl,
  getPointsAgainst,
  getPointsFor,
  getRecord,
  getRosters,
  getTeamName,
  getUsers,
} from "@/lib/sleeper";

export default async function TeamPickerPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  let rosters, users, playoffOdds;
  try {
    [rosters, users, playoffOdds] = await Promise.all([
      getRosters(leagueId),
      getUsers(leagueId),
      getPlayoffOdds(leagueId),
    ]);
  } catch {
    notFound();
  }
  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const oddsByRosterId = new Map(playoffOdds.map((o) => [o.rosterId, o.playoffOdds]));

  const teams: TeamSummary[] = rosters
    .map((roster) => {
      const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
      return {
        rosterId: roster.roster_id,
        teamName: getTeamName(owner),
        ownerName: owner?.display_name ?? "Unassigned",
        avatarUrl: getAvatarUrl(owner?.avatar ?? null),
        record: getRecord(roster),
        pointsFor: getPointsFor(roster),
        pointsAgainst: getPointsAgainst(roster),
        playoffOdds: oddsByRosterId.get(roster.roster_id) ?? 0,
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName));

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Front Office
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Your fantasy football command center.
          </p>
        </div>

        <Separator />

        <TeamDashboard teams={teams} leagueId={leagueId} />
      </div>
    </div>
  );
}
