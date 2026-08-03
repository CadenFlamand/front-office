"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getManualCoManagerAdvice } from "@/lib/manual-advice-action";
import { isManualLeagueId } from "@/lib/manual-league";
import {
  type AdviceBullet,
  type AdviceBulletCategory,
  type AdviceSignals,
  formatAdviceCompact,
  formatAdviceExpanded,
} from "@/lib/team-advice";
import { getCoManagerAdvice } from "@/lib/team-advice-action";

type Format = "compact" | "expanded";

// Dot color maps to signal category, not sequential/arbitrary — a user
// should be able to tell what kind of signal a bullet is before reading
// it. "neutral" (diagnostic notes, odds trend) gets the same muted tone
// used everywhere else in the app for non-actionable text.
const SIGNAL_DOT_CLASSES: Record<AdviceBulletCategory, string> = {
  streaming: "bg-signal-stream",
  thin: "bg-signal-thin",
  sos: "bg-signal-sos",
  neutral: "bg-muted-foreground",
};

function SignalDot({ category }: { category: AdviceBulletCategory }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${SIGNAL_DOT_CLASSES[category]}`}
    />
  );
}

// Deterministic ~50/50 split per team so each beta tester sees a stable
// default format across visits, without any new analytics/assignment infra
// — the toggle below lets anyone compare the other format directly.
function hashVariant(key: string): Format {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return sum % 2 === 0 ? "compact" : "expanded";
}

export function CoManagerAdvice({
  leagueId,
  rosterId,
}: {
  leagueId: string;
  rosterId: number;
}) {
  const [advice, setAdvice] = useState<AdviceSignals | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestId = useRef(0);
  const [formatOverride, setFormatOverride] = useState<Format | null>(null);

  useEffect(() => {
    const id = ++requestId.current;
    startTransition(async () => {
      setAdvice(null);
      setFormatOverride(null);
      try {
        const result = isManualLeagueId(leagueId)
          ? await getManualCoManagerAdvice(leagueId, rosterId)
          : await getCoManagerAdvice(leagueId, rosterId);
        // A newer request may have started (and resolved) while this one
        // was in flight — ignore this response so a stale team's advice
        // can't overwrite a fresher one.
        if (requestId.current !== id) return;
        setAdvice(result);
      } catch {
        if (requestId.current !== id) return;
        setAdvice(null);
      }
    });
  }, [leagueId, rosterId]);

  if (isPending && !advice) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading advice…
      </div>
    );
  }

  if (!advice) return null;

  const format = formatOverride ?? hashVariant(`${leagueId}:${rosterId}`);
  const compactBullet = formatAdviceCompact(advice);
  const expandedBullets = formatAdviceExpanded(advice);
  if (!compactBullet && expandedBullets.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Co-manager advice
        </p>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setFormatOverride(format === "compact" ? "expanded" : "compact")}
        >
          {format === "compact" ? "Show more" : "Show less"}
        </Button>
      </div>
      {format === "compact" ? (
        compactBullet && <AdviceBulletRow bullet={compactBullet} />
      ) : (
        <ul className="flex flex-col gap-2">
          {expandedBullets.map((bullet, i) => (
            <li key={i}>
              <AdviceBulletRow bullet={bullet} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Generous line-height (advice copy needs to breathe, per the dashboard
// polish spec) and the brighter "copy-bright" body-text tone rather than
// default foreground, matching the spec's lighter-gray advice-text call.
function AdviceBulletRow({ bullet }: { bullet: AdviceBullet }) {
  return (
    <div className="flex items-start gap-2 text-[13px] leading-relaxed text-copy-bright">
      <SignalDot category={bullet.category} />
      <span>{bullet.text}</span>
    </div>
  );
}
