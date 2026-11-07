import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { css } from "@/content/fragments";

const nav = [
  { to: "/spaces", label: "Spaces" },
  { to: "/edge-data-centres", label: "Edge data centres" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/get-started", label: "List your space" },
] as const;

/** Adds .rv reveal-on-scroll to sections, cards and photo rows on every page. */
function useReveal(deps: unknown) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(
      "main .sechead, main .focus .in, main .type, main .card, main .split, main .side, main form.f, main .plan, main .steps li, main .stat, main .cta-band .in, main .pagehead .in",
    );
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in-view"), io.unobserve(e.target))),
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el, i) => {
      el.classList.add("rv");
      el.style.transitionDelay = `${(i % 3) * 90}ms`;
      io.observe(el);
    });
    const ph = document.querySelector<HTMLElement>(".hero .ph");
    const onScroll = () => ph && ph.style.setProperty("--py", `${window.scrollY * 0.25}px`);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [deps]);
}

export function Site({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useReveal(path);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <nav>
        <div className="in">
          <Link to="/" className="logo"><i />PowerSite</Link>
          <div className="links">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} activeProps={{ className: "active" }}>{n.label}</Link>
            ))}
            <Link to="/get-started" hash="rent" className="btn d">Find space</Link>
          </div>
        </div>
      </nav>
      <main>{children}</main>
      <footer>
        <div className="in">
          <div><strong>PowerSite</strong><br />Spare space and power, NSW.</div>
          <div className="flinks">
            {nav.map((n) => <Link key={n.to} to={n.to}>{n.label}</Link>)}
          </div>
          <div style={{ maxWidth: "48ch" }}>Power figures on listings are estimates. Always confirm with your network provider before signing anything.</div>
        </div>
      </footer>
    </>
  );
}

export function Html({ html }: { html: string }) {
  // The copy fragments use root links like href="/get-started"; point them at the site's base path.
  const based = html.replace(/href="\/(?!\/)/g, `href="${import.meta.env.BASE_URL}`);
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: based }} />;
}

export function PageHead({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <header className="pagehead">
      <div className="in">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
    </header>
  );
}
