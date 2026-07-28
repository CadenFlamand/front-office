"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

function subscribe() {
  return () => {};
}

// Forces exactly one extra client-side render after hydration (server
// snapshot false, client snapshot true) — same hydration-safe pattern
// components/league-entry.tsx already uses for client-only state, and
// avoids the "setState in an effect" pattern this repo's lint config flags.
function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

// Simple light/dark switch rather than a light/dark/system cycle — one
// click, predictable outcome. defaultTheme="system" (set on the provider in
// app/layout.tsx) still means a first-time visitor gets their OS preference
// with no click required; this button only overrides it.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // resolvedTheme is unknown on the server (and briefly on the client,
  // before next-themes reads localStorage/system preference), so the real
  // icon can't render yet without risking a hydration mismatch — render a
  // neutral placeholder until mounted.
  const mounted = useIsMounted();

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" disabled>
        <Sun className="size-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
