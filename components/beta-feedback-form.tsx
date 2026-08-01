"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { submitBetaFeedback } from "@/lib/db/beta-feedback";
import { isValidEmail } from "@/lib/validate-email";

export function BetaFeedbackForm() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success">("idle");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmedEmail = email.trim();
    const trimmedFeedback = feedback.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (trimmedFeedback.length === 0) {
      setError("Add some feedback before sending.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitBetaFeedback(trimmedEmail, trimmedFeedback);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong — try again in a moment.");
        return;
      }
      setEmail("");
      setFeedback("");
      setStatus("success");
    });
  }

  if (status === "success") {
    return (
      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
        Thanks — we read every submission and it helps shape what we build next.
      </p>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="feedback-email"
          autoComplete="email"
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@email.com"
          type="email"
          value={email}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-text" className="text-sm font-medium">
          Feedback
        </label>
        <textarea
          id="feedback-text"
          className="min-h-28 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="What's working, what's not, what should we build next?"
          value={feedback}
        />
      </div>

      <Button className="shrink-0" disabled={isPending} size="lg" type="submit" variant="outline">
        {isPending ? "Sending…" : "Send feedback"}
      </Button>

      {error && <p className="text-left text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
