"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

// Root-level catch-all — / and /start don't fetch on render (validateLeagueId
// already handles its own errors inline), so this shouldn't normally fire,
// but it's here so nothing above the league-scoped pages can crash to a bare
// error overlay either.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState onRetry={unstable_retry} homeHref="/start" homeLabel="Get started" />;
}
