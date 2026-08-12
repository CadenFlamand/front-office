import { notFound } from "next/navigation";

import { OddsTrendSparkline } from "@/components/odds-trend-sparkline";
import { TeamDashboard, type TeamSummary } from "@/components/team-dashboard";
import { Separator } from "@/components/ui/separator";
import { requireManualLeagueAccess } from "@/lib/auth/dal";
import { getManualLeague, getManualTeams } from "@/lib/db/manual-leagues";
import { isNotFound } from "@/lib/http";
import {
  computeManualStandingsRanks,
  formatManualRecord,
  getManualBucket,
  isManualLeagueId,
} from "@/lib/manual-league";
import { getLeagueData } from "@/lib/league-data";
import { formatRecord, managerDisplayName, managerTeamName } from "@/lib/league-types";
import { getPlayoffOdds } from "@/lib/playoff-odds";
import { computeStandingsRanks } from "@/lib/standings";
import { getPlayoffBucket } from "@/lib/team-context";

export default async function TeamPickerPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;

  if (isManualLeagueId(leagueId)) {
    // Owner-only; Sleeper leagues below stay publicly viewable.
    await requireManualLeagueAccess(leagueId);
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

  let leagueData, playoffOdds;
  try {
    [leagueData, playoffOdds] = await Promise.all([
      getLeagueData(leagueId),
      getPlayoffOdds(leagueId),
    ]);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
  const { rosters, managers } = leagueData;
  const managersById = new Map(managers.map((manager) => [manager.ownerId, manager]));
  const oddsByRosterId = new Map(playoffOdds.map((o) => [o.rosterId, o.playoffOdds]));
  const ranksByRosterId = computeStandingsRanks(rosters);

  const teams: TeamSummary[] = rosters
    .map((roster) => {
      const manager = roster.ownerId ? managersById.get(roster.ownerId) : undefined;
      const odds = oddsByRosterId.get(roster.rosterId) ?? 0;
      const ranks = ranksByRosterId.get(roster.rosterId);
      return {
        rosterId: roster.rosterId,
        teamName: managerTeamName(manager),
        ownerName: managerDisplayName(manager),
        avatarUrl: manager?.avatarUrl,
        record: formatRecord(roster),
        pointsFor: roster.pointsFor,
        pointsAgainst: roster.pointsAgainst,
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
    // Manual leagues have no playoff-odds/snapshot data to trend at all
    // (never written to tracked_leagues) — omitting the panel entirely
    // rather than handing it a leagueId it can only ever show an empty
    // state for.
    sidePanel: <OddsTrendSparkline leagueId={leagueId} />,
  });
}

function renderDashboardShell({
  heading,
  subtitle,
  teams,
  leagueId,
  sidePanel,
}: {
  heading: string;
  subtitle: string;
  teams: TeamSummary[];
  leagueId: string;
  sidePanel?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      {/* Shrink-wrapped row (w-fit), not a full-width one: sizing the row to
          exactly its content — 672px main + 40px gap + 320px aside — and
          letting the parent's items-center center *that block* is what
          keeps main+aside centered as a unit, with equal dead space on
          both sides. Pinning main to its old solo-centered position (a
          previous version of this fix did that via CSS grid) put the
          aside's width entirely on one side, dragging the visual center
          right.

          main uses a fixed xl:w-[42rem], not xl:w-full — a percentage
          width can't resolve against this row's own shrink-to-fit (w-fit)
          size, which is exactly the circular-sizing bug that shrank main
          to its intrinsic content width the first time this layout broke.
          A fixed length has no such dependency. */}
      <div className="flex w-full flex-col gap-8 xl:w-fit xl:flex-row xl:items-start xl:gap-10">
        <div className="flex w-full max-w-2xl flex-col gap-8 xl:w-[42rem] xl:max-w-none xl:shrink-0">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-zinc-600 dark:text-zinc-400">{subtitle}</p>
          </div>

          <Separator />

          <TeamDashboard teams={teams} leagueId={leagueId} />
        </div>

        {sidePanel && (
          <aside className="hidden w-80 shrink-0 xl:block">{sidePanel}</aside>
        )}
      </div>
    </div>
  );
}
