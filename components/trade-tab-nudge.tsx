"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

const NUDGE_SEEN_KEY = "front-office:seen-trade-nudge";

// Matches components/team-dashboard.tsx's storage key and event name —
// duplicated rather than imported so this stays decoupled from the team
// picker's internals, same rationale lib/team-selection.ts already uses
// for the same key.
const TEAM_CHANGE_EVENT = "front-office:team-change";

function buildTeamStorageKey(leagueId: string): string {
  return `front-office:my-team:${leagueId}`;
}

// Shown exactly once, ever, app-wide — the moment a team is first selected
// (not on mount, so a returning visitor who already has a team picked
// never triggers it just by loading the page). Marked as seen the instant
// it appears rather than only on dismiss, so navigating away and back
// can't bring it back either.
export function TradeTabNudge({ leagueId }: { leagueId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleTeamChange() {
      if (window.localStorage.getItem(NUDGE_SEEN_KEY)) return;
      if (!window.localStorage.getItem(buildTeamStorageKey(leagueId))) return;
      window.localStorage.setItem(NUDGE_SEEN_KEY, "true");
      setVisible(true);
    }

    window.addEventListener(TEAM_CHANGE_EVENT, handleTeamChange);
    return () => window.removeEventListener(TEAM_CHANGE_EVENT, handleTeamChange);
  }, [leagueId]);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-end gap-2 border-b bg-muted/40 px-4 py-2 sm:px-6">
      <Link
        href={`/${leagueId}/trade`}
        className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary"
        onClick={() => setVisible(false)}
      >
        Try the Trade Analyzer
        <ArrowRight className="size-3.5" />
      </Link>
      <button
        aria-label="Dismiss"
        className="text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setVisible(false)}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
