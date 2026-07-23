import { captureSnapshot } from "@/lib/db/snapshot";

// Duplicated from lib/sleeper.ts's own LEAGUE_ID constant rather than
// imported (it isn't exported) — see the same rationale already used
// elsewhere in this codebase for this exact constant.
const LEAGUE_ID = "1385091542758203392";

// Manual trigger for testing captureSnapshot() by hand — hit this route
// directly (browser or curl). No auth and no schedule yet; this is a
// stepping stone before wiring up an automatic weekly capture.
export async function GET() {
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
