import { useSyncExternalStore } from "react";

// Must match the key used by components/team-dashboard.tsx. Duplicated
// rather than imported so this page never depends on (or risks changing)
// the team picker's behavior.
const TEAM_STORAGE_KEY = "front-office:my-team";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): string | null {
  return window.localStorage.getItem(TEAM_STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

// Read-only: reflects whatever team is currently picked via the home page's
// team picker. Does not write to storage.
export function useStoredRosterId(): number | null {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return stored ? Number(stored) : null;
}
