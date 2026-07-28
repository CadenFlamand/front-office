"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

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

  return (
    <ErrorState onRetry={unstable_retry} homeHref="/start" homeLabel="Try your own trade" />
  );
}
