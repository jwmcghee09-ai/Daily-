"use client";

import { useEffect, useState } from "react";
import InstallButton from "./install-button";

// Public GitHub Release assets, built + published by the Desktop Release
// workflow. "latest" always resolves to the newest published release, so these
// links keep working across version bumps.
const BASE = "https://github.com/jwmcghee09-ai/Daily-/releases/latest/download";
const MAC_ARM = `${BASE}/SPECTRE-mac-arm64.dmg`;
const MAC_X64 = `${BASE}/SPECTRE-mac-x64.dmg`;
const WIN_X64 = `${BASE}/SPECTRE-win-x64.exe`;
const RELEASES = "https://github.com/jwmcghee09-ai/Daily-/releases/latest";

type OS = "mac" | "win" | "mobile" | "other";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const plat = nav.userAgentData?.platform || navigator.platform || "";
  const isMobile = /iPhone|iPad|iPod|Android/i.test(ua)
    || (/Mac/i.test(plat) && navigator.maxTouchPoints > 1); // iPadOS reports as Mac
  if (isMobile) return "mobile";
  if (/Win/i.test(plat) || /Windows/i.test(ua)) return "win";
  if (/Mac/i.test(plat) || /Macintosh|Mac OS X/i.test(ua)) return "mac";
  return "other";
}

export default function DownloadButtons() {
  const [os, setOs] = useState<OS | null>(null);

  useEffect(() => {
    // Deferred so the first paint isn't a synchronous setState in the effect.
    const raf = requestAnimationFrame(() => setOs(detectOS()));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Phones/tablets can't run a desktop installer — the installable web app
  // (Add to Home Screen) is the right thing for them.
  if (os === "mobile") {
    return (
      <div className="dl-cta">
        <InstallButton />
        <p className="dl-firstrun">
          On a phone or tablet, SPECTRE adds to your home screen and opens
          full-screen — no app store needed. Desktop installers are on
          <a href={RELEASES} target="_blank" rel="noreferrer"> the releases page</a>.
        </p>
      </div>
    );
  }

  const primaryHref = os === "win" ? WIN_X64 : MAC_ARM;
  const primaryLabel = os === "win" ? "Download for Windows" : "Download for Mac";

  return (
    <div className="dl-cta">
      <a className="dl-btn" href={primaryHref}>
        <DownloadIcon />
        <span>{primaryLabel}</span>
      </a>

      {/* Other platforms — always shown so nobody's stuck on a wrong guess. */}
      <div className="dl-alts">
        {os === "win" ? (
          <>
            <a href={MAC_ARM}>Mac (Apple Silicon)</a>
            <span>·</span>
            <a href={MAC_X64}>Mac (Intel)</a>
          </>
        ) : (
          <>
            <a href={MAC_X64}>Mac (Intel)</a>
            <span>·</span>
            <a href={WIN_X64}>Windows</a>
          </>
        )}
      </div>

      <p className="dl-firstrun">
        {os === "win" ? (
          <>First launch: Windows may show a blue “Windows protected your PC” box — click <b>More info → Run anyway</b>. It’s shown once because the app isn’t code-signed yet.</>
        ) : (
          <>First launch: right-click SPECTRE in Applications → <b>Open</b> (just once), since the app isn’t notarised by Apple yet. After that it opens normally.</>
        )}
      </p>

      {/* Lightweight alternative: install as a web app, no download. */}
      <details className="dl-webapp">
        <summary>Prefer no download? Add the web app instead</summary>
        <div className="dl-webapp-body">
          <InstallButton />
        </div>
      </details>
    </div>
  );
}
