"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Placeholder upgrade CTA shown when a free account hits the one-league
 * limit. There is deliberately no billing behind this yet — no payment
 * processor, no subscription state beyond the users.plan column, which is
 * set by hand. The button acknowledges the click and says so plainly rather
 * than pretending to start a checkout that doesn't exist.
 */
export function UpgradePrompt({ context = "league" }: { context?: "league" | "manual" }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-brand-gold/40 bg-brand-gold/5 px-4 py-5 text-center">
      <Sparkles aria-hidden="true" className="size-5 text-brand-gold" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Premium required</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Free accounts track one league. Upgrade to add{" "}
          {context === "manual" ? "another league" : "more leagues"}, and get improved
          rankings alongside it.
        </p>
      </div>
      <Button
        onClick={() =>
          alert("Premium isn't available yet — this is a placeholder while billing gets built.")
        }
        size="sm"
        variant="outline"
      >
        Upgrade
      </Button>
    </div>
  );
}
