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

const dmSans = localFont({
  variable: "--font-dm-sans",
  display: "swap",
  src: [
    { path: "../../public/fonts/DMSans-latin.woff2", weight: "100 900", style: "normal" },
    { path: "../../public/fonts/DMSans-latin-ext.woff2", weight: "100 900", style: "normal" },
  ],
});

const dmMono = localFont({
  variable: "--font-dm-mono",
  display: "swap",
  src: [
    { path: "../../public/fonts/DMMono-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/DMMono-Regular-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/DMMono-Medium-latin.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/DMMono-Medium-latin-ext.woff2", weight: "500", style: "normal" },
  ],
});

const sora = localFont({
  variable: "--font-sora",
  display: "swap",
  src: [
    { path: "../../public/fonts/Sora-latin.woff2", weight: "100 800", style: "normal" },
    { path: "../../public/fonts/Sora-latin-ext.woff2", weight: "100 800", style: "normal" },
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
  title: "SPECTRE — AI Portfolio Intelligence for Australian Investors",
  description: "SPECTRE — AI portfolio intelligence for Australian investors. Risk scoring, Monte Carlo simulation, and AI analysis in one dashboard.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SPECTRE",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-apple-touch.png", sizes: "180x180", type: "image/png" }],
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
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null;
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
      <head>
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '942949321933981');
          fbq('track', 'PageView');
        `}</Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img height="1" width="1" style={{display:"none"}} src="https://www.facebook.com/tr?id=942949321933981&ev=PageView&noscript=1" alt="" />
        </noscript>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${dmMono.variable} ${sora.variable} ${spaceGrotesk.variable}`}
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
      </body>
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
      <Script id="sw-register" strategy="afterInteractive">{`
        if ('serviceWorker' in navigator) {
          window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js');
          });
        }
      `}</Script>
    </html>
  );
}
