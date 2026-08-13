import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Oswald } from "next/font/google";
import "./globals.css";

import { FeedbackFloatingButton } from "@/components/feedback-floating-button";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Display/headline font — loaded at a single fixed weight (not the full
// variable range) so it always renders bold wherever font-heading is
// applied, regardless of whatever Tailwind font-weight utility already
// sits on that element.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: "700",
});

// Numeric-data font (odds percentages, trade values, deltas) — variable,
// no fixed weight, same as Geist before it: per-element Tailwind weight
// utilities (font-medium/font-semibold/etc.) keep controlling weight.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const TAGLINE = "Front Office tells you what the trade does to your season.";

export const metadata: Metadata = {
  title: "Front Office",
  description: TAGLINE,
  openGraph: {
    title: "Front Office",
    description: TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Front Office",
    description: TAGLINE,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${oswald.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <FeedbackFloatingButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
