import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { FeedbackFloatingButton } from "@/components/feedback-floating-button";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
