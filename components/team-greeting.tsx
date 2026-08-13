"use client";

import type { TeamSummary } from "@/components/team-dashboard";
import { useStoredRosterId } from "@/lib/team-selection";

// Reads the same client-only team selection TeamDashboard itself reads
// (useStoredRosterId + the already-fetched teams list) rather than a new
// fetch or field — teamName is already in TeamSummary, sourced the same
// way the dashboard's own team-name display is. Renders nothing (not a
// generic "Welcome back, Coach") when no team is picked yet: TeamDashboard
// already prompts "Pick your team to get started" for that state, so a
// name-less greeting above it would just be redundant.
export function TeamGreeting({
  teams,
  leagueId,
}: {
  teams: TeamSummary[];
  leagueId: string;
}) {
  const rosterId = useStoredRosterId(leagueId);
  const selectedTeam = teams.find((team) => team.rosterId === rosterId);
  if (!selectedTeam) return null;

  return (
    <p className="font-heading text-lg font-medium text-copy-bright">
      Welcome back, Coach {selectedTeam.teamName}
    </p>
  );
}
