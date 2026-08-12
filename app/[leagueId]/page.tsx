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
      {/* A grid, not a shrink-wrapped row: the middle track is fixed at
          the same 672px main has always been, and the two flanking `1fr`
          tracks split whatever's left over *evenly* — a guarantee about
          the tracks themselves, unrelated to what's inside them. That's
          what keeps main dead-centered on the viewport regardless of
          whether the aside is present, unlike centering the whole
          main+aside block as a unit (a previous version of this fix did
          that, which correctly centered the pair but no longer centered
          main on its own).

          The aside sits with justify-self-end in the right track — flush
          against the outer edge (inside the page's own px-6 padding)
          rather than hugging main — so it visibly reads as "using the
          dead space near the edge" instead of crowding the main column.

          The reveal breakpoint is the exact custom value 1440px, not a
          stock xl:/2xl:: the equal-1fr guarantee above only holds once
          each flanking track's fair share is at least as wide as the
          aside (320px) on its own: 48px padding + 320px*2 + 40px*2 gaps +
          672px main = 1440px exactly. Below that, the grid's automatic
          min-content sizing forces the right track to take more than its
          fair half to fit the aside, stealing space from the empty left
          track and pulling main off-center again. */}
      <div className="grid w-full grid-cols-1 gap-8 min-[1440px]:grid-cols-[1fr_minmax(0,42rem)_1fr] min-[1440px]:items-start min-[1440px]:gap-10">
        <div className="flex w-full max-w-2xl flex-col gap-8 justify-self-center min-[1440px]:col-start-2">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-zinc-600 dark:text-zinc-400">{subtitle}</p>
          </div>

          <Separator />

          <TeamDashboard teams={teams} leagueId={leagueId} />
        </div>

        {sidePanel && (
          <aside className="hidden w-80 shrink-0 min-[1440px]:col-start-3 min-[1440px]:block min-[1440px]:justify-self-end">
            {sidePanel}
          </aside>
        )}
      </div>
    </div>
  );
}
