"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { resetPassword } from "@/lib/auth/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await resetPassword(token, newPassword);
        // A successful reset redirects (see lib/auth/actions.ts), so
        // reaching here means it returned a validation failure instead.
        if (!result.ok) setError(result.error);
      } catch (thrown) {
        // redirect() communicates by throwing — same re-throw as
        // components/auth-form.tsx, for the same reason.
        if (
          thrown &&
          typeof thrown === "object" &&
          "digest" in thrown &&
          typeof thrown.digest === "string" &&
          thrown.digest.startsWith("NEXT_REDIRECT")
        ) {
          throw thrown;
        }
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">New password</span>
        <input
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="At least 8 characters"
          type="password"
          value={newPassword}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Confirm new password</span>
        <input
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          value={confirmPassword}
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button disabled={isPending} type="submit">
        {isPending ? "Resetting…" : "Reset password"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link className="underline underline-offset-2 hover:text-foreground" href="/signin">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
