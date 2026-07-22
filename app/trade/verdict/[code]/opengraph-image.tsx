import { ImageResponse } from "next/og";

import { getTradeLabel, type TradeLabel } from "@/lib/trade-label";

import { getVerdictData } from "./page";

export const alt = "Front Office trade verdict";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LABEL_EMOJI: Record<TradeLabel, string> = {
  "Roster Tune-Up": "🛠️",
  "Win-Now Swing": "⚡",
  "Value Add": "📈",
  "Blockbuster Deal": "💥",
};

const CARD_STYLE = {
  position: "relative" as const,
  width: "100%",
  height: "100%",
  display: "flex" as const,
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  background: "#fafafa",
  fontFamily: "sans-serif",
};

const WORDMARK_STYLE = {
  position: "absolute" as const,
  bottom: 48,
  left: 0,
  right: 0,
  display: "flex" as const,
  justifyContent: "center",
  fontSize: 28,
  fontWeight: 600,
  color: "#a1a1aa",
};

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await getVerdictData(code);

  if (!data) {
    return new ImageResponse(
      (
        <div style={CARD_STYLE}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#18181b" }}>
            Front Office
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#71717a", marginTop: 16 }}>
            Fantasy football trade analyzer
          </div>
        </div>
      ),
      size
    );
  }

  const { team, diff, receivePlayers, odds } = data;
  const oddsDelta = odds ? odds.after - odds.before : 0;
  const label = getTradeLabel(diff, oddsDelta, receivePlayers);
  const emoji = LABEL_EMOJI[label];

  return new ImageResponse(
    (
      <div style={CARD_STYLE}>
        <div style={{ display: "flex", fontSize: 120 }}>{emoji}</div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: "#18181b",
            marginTop: 24,
          }}
        >
          {label}
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#71717a", marginTop: 16 }}>
          {team.teamName}
        </div>
        <div style={WORDMARK_STYLE}>Front Office</div>
      </div>
    ),
    size
  );
}
