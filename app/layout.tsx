import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppToaster } from "../components/ui/sonner";

const fontSans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "BALUX — BIM Viewer (Web) by Fathi",
  description:
    "Built with Next.js, React, TypeScript, three.js, That Open Engine (@thatopen/components, @thatopen/components-front, @thatopen/fragments), web-ifc, three-mesh-bvh, Zustand, and Tailwind CSS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Some browser extensions (e.g. Grammarly) inject `data-*` attributes into <html>/<body>
  // before React hydrates, causing noisy hydration mismatch warnings in dev.
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${fontSans.variable} ${fontMono.variable} font-sans`}
      >
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
