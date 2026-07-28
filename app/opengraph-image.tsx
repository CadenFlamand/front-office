import { ImageResponse } from "next/og";

export const alt = "Front Office — fantasy football trade analyzer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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

const BADGE_STYLE = {
  display: "flex" as const,
  padding: "10px 24px",
  borderRadius: 999,
  border: "2px solid #e4e4e7",
  fontSize: 28,
  fontWeight: 600,
  color: "#52525b",
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

export default function Image() {
  return new ImageResponse(
    (
      <div style={CARD_STYLE}>
        <div style={BADGE_STYLE}>Redraft trade analyzer</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 40,
          }}
        >
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: "#18181b" }}>
            Front Office tells you what
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 700,
              color: "#18181b",
              marginTop: 8,
            }}
          >
            the trade does to your season.
          </div>
        </div>
        <div style={WORDMARK_STYLE}>Front Office</div>
      </div>
    ),
    size
  );
}
