"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { submitBetaSignup } from "@/lib/db/beta-signups";
import { isValidEmail } from "@/lib/validate-email";

export function BetaSignupForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "already">("idle");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitBetaSignup(trimmed);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong — try again in a moment.");
        return;
      }
      setStatus(result.alreadySignedUp ? "already" : "success");
    });
  }

  if (status === "success") {
    return (
      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        You&apos;re on the list — we&apos;ll email you when the beta opens up.
      </p>
    );
  }

  if (status === "already") {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        You&apos;re already on the list — hang tight.
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <div className="flex w-full items-center gap-3 text-xs text-muted-foreground uppercase">
        <Separator className="flex-1" />
        not ready to connect a league yet?
        <Separator className="flex-1" />
      </div>

      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            autoComplete="email"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@email.com"
            type="email"
            value={email}
          />
          <Button className="shrink-0" disabled={isPending} size="lg" type="submit" variant="outline">
            {isPending ? "Joining…" : "Join waitlist"}
          </Button>
        </div>
        {error && <p className="text-left text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </div>
  );
}
