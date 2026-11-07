import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Site, Html } from "@/components/Site";
import { hero, stats, spaces, sources } from "@/content/fragments";
import heroImg from "@/assets/hero-yard.jpg";
import carpark from "@/assets/carpark.jpg";
import racks from "@/assets/racks.jpg";
import substation from "@/assets/substation.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PowerSite — Spare space with power in NSW" },
      { name: "description", content: "Carparks, factory yards and depots in NSW with spare power, matched with edge data centres, batteries and EV chargers." },
      { property: "og:title", content: "PowerSite — Spare space with power in NSW" },
      { property: "og:description", content: "Carparks, factory yards and depots in NSW with spare power, matched with edge data centres, batteries and EV chargers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  useEffect(() => {
    const f = document.getElementById("search") as HTMLFormElement | null;
    if (!f) return;
    const go = (e: Event) => {
      e.preventDefault();
      const v = (id: string) => (document.getElementById(id) as HTMLSelectElement).value;
      navigate({ to: "/spaces", search: { type: v("s-type"), k: v("s-kva"), r: v("s-region") } as never });
    };
    f.addEventListener("submit", go);
    return () => f.removeEventListener("submit", go);
  }, [navigate]);
  const heroHtml = hero.replace('<div class="in">', `<div class="ph" style="background-image:url(${heroImg})"></div><div class="in">`);
  return (
    <Site>
      <Html html={heroHtml} />
      <Html html={stats} />
      <Html html={spaces} />
      <section className="focus"><div className="in">
        <div className="range"><em>50&nbsp;kVA</em> to<br />10&nbsp;MW</div>
        <div>
          <span className="eyebrow">Our focus</span>
          <h2>The projects too small for the big brokers</h2>
          <p>Large brokers chase hyperscale sites. A container data centre, a battery or a charging hub needs a few bays and a few hundred kVA. Those spaces are rarely listed anywhere, so we find them through owners and agents and check the power before anyone signs.</p>
          <Link to="/pricing" className="btn o">See pricing</Link>
        </div>
      </div></section>
      <section className="alt"><div className="in" style={{ display: "grid", gap: 140 }}>
        <div className="split">
          <figure><img src={carpark} alt="Half-empty shopping centre carpark at dusk" loading="lazy" width={1264} height={848} /></figure>
          <div><span className="eyebrow">Carparks</span><h2>The back rows that never fill</h2>
            <p>A 20-foot container takes up about two car bays once you allow for access. Shopping centre, office and station carparks often have both the space and the supply.</p>
            <Link to="/spaces" className="btn d">See example spaces</Link></div>
        </div>
        <div className="split rev">
          <figure><img src={racks} alt="Server racks inside a container data centre" loading="lazy" width={1600} height={1072} /></figure>
          <div><span className="eyebrow">Edge data centres</span><h2>Days to install, not years</h2>
            <p>Modular units arrive from the factory ready to plug in, with racks, cooling, fire suppression and power gear inside.</p>
            <Link to="/edge-data-centres" className="btn o">How edge data centres work</Link></div>
        </div>
        <div className="split">
          <figure><img src={substation} alt="Zone substation beside a rural paddock" loading="lazy" width={1600} height={1072} /></figure>
          <div><span className="eyebrow">Rural land</span><h2>Paddocks next to substations</h2>
            <p>Paddocks and sheds close to a zone substation with headroom, for batteries and larger modular data centres.</p>
            <Link to="/how-it-works" className="btn o">How it works</Link></div>
        </div>
      </div></section>
      <section className="cta-band"><div className="in">
        <span className="eyebrow">Get started</span>
        <h2>Spare space with power, matched with people who need it</h2>
        <div className="ctas">
          <Link to="/get-started" hash="rent" className="btn d">I need space and power</Link>
          <Link to="/get-started" hash="host" className="btn o">I have space to rent out</Link>
        </div>
      </div></section>
      <Html html={sources} />
    </Site>
  );
}
