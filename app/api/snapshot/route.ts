import { captureSnapshot, type CaptureSnapshotResult } from "@/lib/db/snapshot";
import { getTrackedLeagueIds } from "@/lib/db/tracked-leagues";

interface LeagueSnapshotOutcome {
  leagueId: string;
  ok: boolean;
  result?: CaptureSnapshotResult;
  error?: string;
}

// Triggered weekly by Vercel Cron (see vercel.json), which automatically
// sends `Authorization: Bearer <CRON_SECRET>` using whatever value is set
// for that env var in the project — so this doubles as the auth check for
// manual/local calls too. Fails closed: if CRON_SECRET isn't set, no
// header will ever match.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leagueIds = await getTrackedLeagueIds();

  // Sequential, not Promise.all: one bad/deleted league shouldn't take down
  // the run, and this avoids hammering Sleeper with a burst of concurrent
  // requests as the tracked-league count grows.
  const outcomes: LeagueSnapshotOutcome[] = [];
  for (const leagueId of leagueIds) {
    try {
      const result = await captureSnapshot(leagueId);
      outcomes.push({ leagueId, ok: true, result });
    } catch (error) {
      outcomes.push({
        leagueId,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const succeeded = outcomes.filter((outcome) => outcome.ok).length;

  return Response.json({
    totalLeagues: leagueIds.length,
    succeeded,
    failed: leagueIds.length - succeeded,
    results: outcomes,
  });
}
