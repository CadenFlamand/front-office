import { captureSnapshot } from "@/lib/db/snapshot";

// Duplicated from lib/sleeper.ts's own LEAGUE_ID constant rather than
// imported (it isn't exported) — see the same rationale already used
// elsewhere in this codebase for this exact constant.
const LEAGUE_ID = "1385091542758203392";

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

  try {
    const result = await captureSnapshot(LEAGUE_ID);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
