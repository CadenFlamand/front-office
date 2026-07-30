import { Badge } from "@/components/ui/badge";
import type { SosWindow } from "@/lib/sos";

// Shared between the dashboard's player-sos-list.tsx and the trade
// analyzer, so a tier reads identically in both places — unlike small
// data-fetch helpers this codebase duplicates per module, this is real UI
// markup, and other components already get imported across files this way
// (e.g. trade-analyzer.tsx's OddsDiffLine/TeamContextLine/Verdict reused by
// the shared verdict page).
const SOS_TIER_LABEL: Record<SosWindow["tier"], string> = {
  favorable: "Favorable",
  neutral: "Neutral",
  brutal: "Brutal",
  unavailable: "N/A",
};

const SOS_TIER_CLASSES: Record<SosWindow["tier"], string> = {
  favorable:
    "text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30",
  neutral: "text-foreground",
  brutal: "text-red-600 dark:text-red-400 border-red-600/30 dark:border-red-400/30",
  unavailable: "text-muted-foreground",
};

export function SosTierBadge({ window }: { window: SosWindow }) {
  const label =
    window.tier === "unavailable"
      ? SOS_TIER_LABEL[window.tier]
      : `${SOS_TIER_LABEL[window.tier]} (${window.favorableCount}/${window.totalWeeks})`;

  return (
    <Badge variant="outline" className={SOS_TIER_CLASSES[window.tier]}>
      {label}
    </Badge>
  );
}
