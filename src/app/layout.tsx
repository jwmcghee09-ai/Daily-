import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import NavigationProgress from "@/components/navigation-progress";

const geistSans = localFont({
  variable: "--font-geist-sans",
  display: "swap",
  src: [
    { path: "../../public/fonts/Geist-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/Geist-500-latin.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/Geist-600-latin.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/Geist-700-latin.woff2", weight: "700", style: "normal" },
  ],
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: [
    { path: "../../public/fonts/GeistMono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/GeistMono-500-latin.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/GeistMono-600-latin.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/GeistMono-700-latin.woff2", weight: "700", style: "normal" },
  ],
});

const spaceGrotesk = localFont({
  variable: "--font-space-grotesk",
  display: "swap",
  src: [
    { path: "../../public/fonts/SpaceGrotesk-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/SpaceGrotesk-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/SpaceGrotesk-latin-700.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://spectre-assets.com"),
  /*
   * These are the page as a search result and as a link in a chat, which is
   * where most people meet it first. They kept the old hero line —
   * "plan like an investor, run it like a machine" — for a while after the
   * homepage stopped saying it, so the card and the page disagreed. Change
   * them together with the hero.
   */
  title: "SPECTRE — AI Portfolio Intelligence for Australian Investors",
  description:
    "Import your broker, super and crypto. SPECTRE looks inside your ETFs and funds using SEC filings, scores your real risk in 60 seconds, and answers questions about what you actually own.",
  keywords: [
    "portfolio tracker australia", "asx portfolio", "ai portfolio analysis",
    "etf look through", "etf holdings breakdown", "13f", "n-port",
    "risk score", "commsec import", "super tracking", "monte carlo portfolio",
  ],
  openGraph: {
    type: "website",
    url: "https://spectre-assets.com",
    siteName: "SPECTRE",
    title: "SPECTRE — A spreadsheet can't answer questions. A chatbot can't see your money.",
    description:
      "AI portfolio intelligence for Australian investors. It looks inside your funds from SEC filings, so your risk score is built on the stocks you really own.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SPECTRE — AI Portfolio Intelligence" }],
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "SPECTRE — A spreadsheet can't answer questions. A chatbot can't see your money.",
    description:
      "Import everything, see inside your funds, and ask your portfolio anything. Free while we grow — no card required.",
    images: ["/og-image.png"],
  },
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
/*
 * One pixel, in one place.
 *
 * There were two: a hardcoded block inside <head> and this env-driven one as a
 * direct child of <html>, both with id="meta-pixel". Next dedupes by id so the
 * second never injected, which made NEXT_PUBLIC_META_PIXEL_ID look configurable
 * while the hardcoded id was the one that always fired — and a <Script> outside
 * <body> is not a place React will keep putting things. The id stays as the
 * default so tracking behaves exactly as before; it is public by design and
 * visible in any page source.
 */
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "942949321933981";
const metaPixelScript = metaPixelId
  ? `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', ${JSON.stringify(metaPixelId)});
    fbq('track', 'PageView');
  `
  : null;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      >
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        {metaPixelId ? (
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element -- Meta Pixel requires a plain noscript tracking image. */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(metaPixelId)}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        ) : null}
        {metaPixelScript ? (
          <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: metaPixelScript }} />
        ) : null}
        {cloudflareBeaconConfig ? (
          <Script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={cloudflareBeaconConfig}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
