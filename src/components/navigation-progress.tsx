"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Track when the route actually changes (navigation complete)
  const prevRouteRef = useRef(`${pathname}?${searchParams}`);

  useEffect(() => {
    const current = `${pathname}?${searchParams}`;
    if (current !== prevRouteRef.current) {
      // Navigation completed — finish the bar
      prevRouteRef.current = current;
      setWidth(100);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 350);
    }
  }, [pathname, searchParams]);

  // Listen for clicks on <a> tags to start the bar immediately
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto")) {
        return;
      }

      // Internal navigation — start the progress bar
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setWidth(0);
      setVisible(true);

      // Animate to ~70% quickly, then slow down (simulates pending load)
      let w = 0;
      const step = () => {
        w = w < 30 ? w + 6 : w < 60 ? w + 2 : w < 75 ? w + 0.5 : w;
        if (w < 76) {
          setWidth(w);
          rafRef.current = requestAnimationFrame(step);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    }

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "linear-gradient(90deg, #ff4b33, #ff7a68)",
          boxShadow: "0 0 8px rgba(255,75,51,0.7)",
          transition: width === 100 ? "width 0.2s ease" : "width 0.1s linear",
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}
