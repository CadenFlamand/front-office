import { useCallback, useSyncExternalStore } from "react";

// Must match the key/event built by components/team-dashboard.tsx.
// Duplicated rather than imported so this page never depends on (or risks
// changing) the team picker's behavior. Scoped by leagueId so picking a team
// in one league doesn't leak into another league's session.
function buildStorageKey(leagueId: string): string {
  return `front-office:my-team:${leagueId}`;
}

// The native "storage" event only fires in *other* tabs — the tab that
// actually called localStorage.setItem never receives its own event, so a
// consumer of this hook that lives outside TeamDashboard's own subtree (e.g.
// a sibling panel that can't just receive rosterId as a prop) would never
// see a same-tab selection change without this. TeamDashboard dispatches
// this custom event for exactly that reason; every reader of the same
// storage key needs to listen for both.
const TEAM_CHANGE_EVENT = "front-office:team-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(TEAM_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TEAM_CHANGE_EVENT, callback);
  };
}

function getServerSnapshot(): string | null {
  return null;
}

// Read-only: reflects whatever team is currently picked via the team
// picker for this league. Does not write to storage.
export function useStoredRosterId(leagueId: string): number | null {
  const storageKey = buildStorageKey(leagueId);
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(storageKey),
    [storageKey]
  );
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return stored ? Number(stored) : null;
}
