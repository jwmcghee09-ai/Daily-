"use client";

import { useEffect, useRef, useState } from "react";

// The browser's install prompt event (Chromium). Not in the DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallButton() {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const manualRef = useRef<() => string>(() => "");
  const [label, setLabel] = useState("Install the app");
  const [hint, setHint] = useState("");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isiOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    const isFirefox = /firefox|fxios/i.test(ua);
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
      nav.standalone === true;

    const manual = () => {
      if (isiOS) return "On iPhone/iPad: tap the Share button, then “Add to Home Screen”.";
      if (isSafari) return "In Safari on Mac: open File → “Add to Dock” (macOS 14+).";
      if (isFirefox) return "Firefox can’t install web apps on desktop — open SPECTRE in Chrome, Edge or Safari to install, or just use it in the browser.";
      return "Click the install icon in your browser’s address bar, or the ⋮ menu → “Install SPECTRE”.";
    };
    manualRef.current = manual;

    const onBIP = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setHint("One click — ready to install.");
    };
    const onInstalled = () => {
      setLabel("Installed ✓");
      setHint("SPECTRE was added to your apps. Opening it now…");
      window.setTimeout(() => { window.location.href = "/dashboard"; }, 1200);
    };
    if (!standalone) {
      window.addEventListener("beforeinstallprompt", onBIP);
      window.addEventListener("appinstalled", onInstalled);
    }

    // Deferred so the initial UI state isn't a synchronous setState in the effect.
    const raf = requestAnimationFrame(() => {
      if (standalone) {
        setInstalled(true);
        setLabel("Already installed ✓");
        setHint("You’re running the installed app.");
      } else {
        setHint(manual());
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onClick = async () => {
    if (deferred.current) {
      deferred.current.prompt();
      try {
        const choice = await deferred.current.userChoice;
        if (choice.outcome === "accepted") setLabel("Installing…");
        else setHint("No problem — you can install any time from here.");
      } catch {
        /* user dismissed */
      }
      deferred.current = null;
    } else {
      setHint(manualRef.current());
    }
  };

  return (
    <>
      <button type="button" className="dl-btn" onClick={onClick} disabled={installed}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>{label}</span>
      </button>
      <p className="dl-hint">{hint}</p>
    </>
  );
}
