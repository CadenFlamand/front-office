"use client";

import { useCallback, useSyncExternalStore } from "react";

// Same key/event pattern as lib/team-selection.ts: a per-scope storage key
// (here "scope" is a page identity like "trade-analyzer" or "trade-verdict",
// not a leagueId — this is a UI preference for a *kind* of page, not
// per-league data, so it deliberately doesn't vary by which league you're
// viewing) plus one shared change event every reader/writer listens for.
// Unlike team-selection's split (one picker writes, several unrelated
// components read), every consumer here both reads and can write — the
// header switch and every individual "Show value" placeholder on a page all
// toggle the same stored boolean, so revealing values from any one of them
// updates every other consumer on the page live.
function buildStorageKey(scope: string): string {
  return `front-office:show-values:${scope}`;
}

const SHOW_VALUES_CHANGE_EVENT = "front-office:show-values-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SHOW_VALUES_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SHOW_VALUES_CHANGE_EVENT, callback);
  };
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * Per-page-scope "show player values" preference, hidden by default (no
 * stored value, or anything other than the literal string "true", reads as
 * hidden). Returns a setter alongside the value rather than splitting
 * read/write into separate exports — every render site that shows a value
 * is itself a place the user can toggle it back on, so read-only wouldn't
 * cover the actual usage.
 */
export function useValueVisibility(scope: string): [boolean, (next: boolean) => void] {
  const storageKey = buildStorageKey(scope);
  const getSnapshot = useCallback(
    () => window.localStorage.getItem(storageKey),
    [storageKey]
  );
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setShow = useCallback(
    (next: boolean) => {
      window.localStorage.setItem(storageKey, next ? "true" : "false");
      window.dispatchEvent(new Event(SHOW_VALUES_CHANGE_EVENT));
    },
    [storageKey]
  );

  return [stored === "true", setShow];
}
