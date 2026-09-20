"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A loading bar across the top of the viewport during client navigation.
 *
 * It holds no state. Everything it does is an animation, so it writes straight
 * to the node's style: putting the width in state re-rendered the whole
 * component on every animation frame, and setting it from the route effect
 * cascaded another render on top of each navigation. Refs give the same
 * behaviour with a single render for the life of the page.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const barRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevRouteRef = useRef(`${pathname}?${searchParams}`);

  useEffect(() => {
    const paint = (width: number, opacity: number) => {
      const bar = barRef.current;
      if (!bar) return;
      bar.style.transition = width === 100 ? "width 0.2s ease" : "width 0.1s linear";
      bar.style.width = `${width}%`;
      bar.parentElement!.style.opacity = String(opacity);
    };

    const stop = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      timerRef.current = null;
      rafRef.current = null;
    };

    function handleClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto")) {
        return;
      }

      stop();
      paint(0, 1);

      // Rush to ~75%, then hold — the real load decides when it finishes.
      let width = 0;
      const step = () => {
        width = width < 30 ? width + 6 : width < 60 ? width + 2 : width < 75 ? width + 0.5 : width;
        if (width < 76) {
          paint(width, 1);
          rafRef.current = requestAnimationFrame(step);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    }

    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("click", handleClick);
      stop();
    };
  }, []);

  useEffect(() => {
    const current = `${pathname}?${searchParams}`;
    if (current === prevRouteRef.current) return;
    prevRouteRef.current = current;

    // Navigation landed — run the bar out and fade it away.
    const bar = barRef.current;
    if (!bar) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    bar.style.transition = "width 0.2s ease";
    bar.style.width = "100%";

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const node = barRef.current;
      if (!node) return;
      node.parentElement!.style.opacity = "0";
      node.style.width = "0%";
    }, 350);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname, searchParams]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        zIndex: 99999,
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity 0.2s ease",
      }}
    >
      <div
        ref={barRef}
        style={{
          height: "100%",
          width: "0%",
          background: "linear-gradient(90deg, #ff4b33, #ff7a68)",
          boxShadow: "0 0 8px rgba(255,75,51,0.7)",
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}
