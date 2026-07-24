import { useCallback, useSyncExternalStore } from "react";

// Must match the key built by components/team-dashboard.tsx. Duplicated
// rather than imported so this page never depends on (or risks changing)
// the team picker's behavior. Scoped by leagueId so picking a team in one
// league doesn't leak into another league's session.
function buildStorageKey(leagueId: string): string {
  return `front-office:my-team:${leagueId}`;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
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
