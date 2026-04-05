import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { DM_Mono, DM_Sans, Geist, Geist_Mono, Sora, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "SPECTRE - System for Portfolio Exposure, Correlation, Threat & Risk Evaluation",
  description: "SPECTRE portfolio dashboard for consolidated holdings and risk analytics.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05050a",
  colorScheme: "dark",
};

const cloudflareAnalyticsToken = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN?.trim();
const cloudflareBeaconConfig = cloudflareAnalyticsToken
  ? JSON.stringify({ token: cloudflareAnalyticsToken })
  : null;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${dmMono.variable} ${sora.variable} ${spaceGrotesk.variable}`}
      >
        {children}
      </body>
      {cloudflareBeaconConfig ? (
        <Script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={cloudflareBeaconConfig}
          strategy="afterInteractive"
        />
      ) : null}
    </html>
  );
}
