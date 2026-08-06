import { notFound } from "next/navigation";

import { getPlayers } from "@/app/[leagueId]/players/data";
import { ManualLeagueManager } from "@/components/manual-league-manager";
import { requireManualLeagueAccess } from "@/lib/auth/dal";
import { getManualLeague, getManualRosters, getManualTeams } from "@/lib/db/manual-leagues";
import { isManualLeagueId } from "@/lib/manual-league";

export default async function ManageLeaguePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  // Manual-only route — a Sleeper league has nothing to manage here.
  if (!isManualLeagueId(leagueId)) notFound();
  // Manual leagues hold private, user-entered data — owner-only. Checked here
  // so an unauthorized visitor gets a clean redirect/404 rather than the
  // error boundary that the data-layer guards would otherwise surface.
  await requireManualLeagueAccess(leagueId);

  const league = await getManualLeague(leagueId);
  if (!league) notFound();

  const [teams, rosters, players] = await Promise.all([
    getManualTeams(leagueId),
    getManualRosters(leagueId),
    getPlayers(),
  ]);

  const teamsWithRosters = teams.map((team) => ({
    ...team,
    playerIds: rosters.get(team.id) ?? [],
  }));

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <ManualLeagueManager
          leagueId={leagueId}
          leagueName={league.name}
          teams={teamsWithRosters}
          players={players}
        />
      </div>
    </div>
  );
}
