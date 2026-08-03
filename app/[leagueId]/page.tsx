import { notFound } from "next/navigation";

import { TeamDashboard, type TeamSummary } from "@/components/team-dashboard";
import { Separator } from "@/components/ui/separator";
import { getManualLeague, getManualTeams } from "@/lib/db/manual-leagues";
import { isNotFound } from "@/lib/http";
import {
  computeManualStandingsRanks,
  formatManualRecord,
  getManualBucket,
  isManualLeagueId,
} from "@/lib/manual-league";
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
import { computeStandingsRanks } from "@/lib/standings";
import { getPlayoffBucket } from "@/lib/team-context";

export default async function TeamPickerPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  if (isManualLeagueId(leagueId)) {
    const league = await getManualLeague(leagueId);
    if (!league) notFound();

    const manualTeams = await getManualTeams(leagueId);
    const rankByTeamId = computeManualStandingsRanks(manualTeams);

    const teams: TeamSummary[] = manualTeams
      .map((team) => {
        const recordRank = rankByTeamId.get(team.id) ?? manualTeams.length;
        return {
          rosterId: team.id,
          teamName: team.teamName,
          ownerName: "Manual entry",
          record: formatManualRecord(team),
          pointsFor: 0,
          pointsAgainst: 0,
          bucket: getManualBucket(recordRank, manualTeams.length),
          recordRank,
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));

    return renderDashboardShell({
      heading: league.name,
      subtitle: "Manually-entered league.",
      teams,
      leagueId,
    });
  }

  let rosters, users, playoffOdds;
  try {
    [rosters, users, playoffOdds] = await Promise.all([
      getRosters(leagueId),
      getUsers(leagueId),
      getPlayoffOdds(leagueId),
    ]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const oddsByRosterId = new Map(playoffOdds.map((o) => [o.rosterId, o.playoffOdds]));
  const ranksByRosterId = computeStandingsRanks(rosters);

  const teams: TeamSummary[] = rosters
    .map((roster) => {
      const owner = roster.owner_id ? usersById.get(roster.owner_id) : undefined;
      const odds = oddsByRosterId.get(roster.roster_id) ?? 0;
      const ranks = ranksByRosterId.get(roster.roster_id);
      return {
        rosterId: roster.roster_id,
        teamName: getTeamName(owner),
        ownerName: owner?.display_name ?? "Unassigned",
        avatarUrl: getAvatarUrl(owner?.avatar ?? null),
        record: getRecord(roster),
        pointsFor: getPointsFor(roster),
        pointsAgainst: getPointsAgainst(roster),
        playoffOdds: odds,
        bucket: getPlayoffBucket(odds),
        recordRank: ranks?.recordRank ?? rosters.length,
        pfRank: ranks?.pfRank ?? rosters.length,
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName));

  return renderDashboardShell({
    heading: "Front Office",
    subtitle: "Your fantasy football command center.",
    teams,
    leagueId,
  });
}

function renderDashboardShell({
  heading,
  subtitle,
  teams,
  leagueId,
}: {
  heading: string;
  subtitle: string;
  teams: TeamSummary[];
  leagueId: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{heading}</h1>
          <p className="text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        </div>

        <Separator />

        <TeamDashboard teams={teams} leagueId={leagueId} />
      </div>
    </div>
  );
}
