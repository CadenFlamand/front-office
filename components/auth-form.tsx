"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signIn, signUp } from "@/lib/auth/actions";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const isSignUp = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const action = isSignUp ? signUp : signIn;
        const result = await action(email, password);
        // A successful sign-in/up redirects, so reaching here means the
        // action returned a validation failure instead.
        if (result?.error) setError(result.error);
      } catch (thrown) {
        // redirect() communicates by throwing; that's success, not an error,
        // so it has to be re-thrown rather than shown to the user.
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
        <span className="text-sm font-medium">Email</span>
        <input
          autoComplete="email"
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Password</span>
          {!isSignUp && (
            <Link
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              href="/forgot-password"
            >
              Forgot password?
            </Link>
          )}
        </div>
        <input
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => setPassword(event.target.value)}
          placeholder={isSignUp ? "At least 8 characters" : "Your password"}
          type="password"
          value={password}
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button disabled={isPending} type="submit">
        {isPending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "Don't have an account? "}
        <Link
          className="underline underline-offset-2 hover:text-foreground"
          href={isSignUp ? "/signin" : "/signup"}
        >
          {isSignUp ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </form>
  );
}
