import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
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

function Src({ n }: { n: number }) {
  return <sup><a href={`#src${n}`}>{n}</a></sup>;
}

const steps: { t: string; who: string; chip?: string; ifUpgrade?: boolean; body: ReactNode }[] = [
  {
    t: "Apply to the network",
    who: "You and your electrician",
    chip: "~10 business days to review",
    body: <>Send your load, maximum demand and a site plan. The network checks whether the local feeder and transformer can take it, and if not, what has to be upgraded.<Src n={7} /></>,
  },
  {
    t: "Wait in the queue",
    who: "The network",
    chip: "Shared with everyone",
    body: <>Your 200 kVA container is assessed alongside every other application, including speculative ones. Ausgrid alone has 7.5 GW of data centre connections in its pipeline, 5.2 GW still being assessed.<Src n={2} /></>,
  },
  {
    t: "Design, review, resubmit",
    who: "Accredited designer and the network",
    chip: "Repeats until approved",
    body: <>An accredited designer draws up the new works. The network reviews them for safety and its own standards, and plans go back and forth until they're approved. Only then are costs and terms locked in.<Src n={7} /></>,
  },
  {
    t: "Order the equipment",
    who: "Equipment suppliers",
    chip: "~128 weeks for big transformers",
    ifUpgrade: true,
    body: <>A new padmount substation, switchgear and cable for your site. If the upstream substation needs a bigger transformer, worldwide those averaged about 128 weeks to arrive in 2025.<Src n={8} /></>,
  },
  {
    t: "Build it",
    who: "Accredited constructor",
    chip: "~2 years for a zone substation",
    ifUpgrade: true,
    body: <>Trenching, cable runs, road-opening permits and easements. If the area needs a new zone substation, construction alone can take about two years.<Src n={9} /></>,
  },
  {
    t: "Wait for the bulk network",
    who: "Transgrid",
    chip: "Western Sydney: full beyond 2033",
    ifUpgrade: true,
    body: <>If the high-voltage network feeding the area is full, nothing downstream helps. Transgrid says its main Western Sydney network is largely exhausted beyond 2033, and new loads may not connect without major upgrades.<Src n={6} /></>,
  },
];

/** Second section on the home page: why a new connection can take years. */
function Problem() {
  return (
    <section className="problem" id="problem">
      <div className="in">
        <div className="sechead">
          <span className="eyebrow">The problem</span>
          <h2>A container data centre ships in weeks. Its power connection can take years.</h2>
          <p>
            Small, rapid computing sites are built in a factory: racks, cooling, fire suppression and power gear in a 20 ft
            container that needs 50–300 kVA. It can be craned into place in days.<Src n={4} /> But it can't switch on until the
            network connects it, and a new or bigger connection is a chain of steps where each one waits on the last.
          </p>
        </div>

        <h3 className="subhead">What a new connection involves</h3>
        <ol className="timeline">
          {steps.map((s) => (
            <li key={s.t} className={s.ifUpgrade ? "up" : undefined}>
              <div className="th">
                <b>{s.t}</b>
                {s.chip && <span className="chip">{s.chip}</span>}
              </div>
              <span className="who">{s.who}{s.ifUpgrade && " · only if the network needs upgrading"}</span>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="sum">
          <b>Add it up.</b> Where the street has spare capacity, steps 1 to 3 can be quick. As soon as anything upstream needs
          upgrading, the wait is set by the slowest part: transformers, substations and the bulk network. That's when it runs to
          years, and around Sydney more and more connections are hitting it.
        </p>

        <h3 className="subhead">Why it hits small computing sites hardest</h3>
        <div className="hard">
          <div><b>Same queue as the giants</b><p>A 200 kVA edge site waits in the same line as 100 MW campuses.</p></div>
          <div><b>Edge has to be near people</b><p>Its whole point is low latency, so it needs to sit in the city, where the network is busiest.</p></div>
          <div><b>Upgrades don't scale down</b><p>A new padmount substation and cable run can cost a large share of a small project's budget.</p></div>
          <div><b>Hardware ages while it waits</b><p>Servers and GPUs lose value every month they sit in a container with no power.</p></div>
        </div>

        <h3 className="subhead">The shortcut: power that's already connected</h3>
        <div className="paths" aria-label="Two ways to power a project">
          <div className="path slow">
            <span className="eyebrow">New connection</span>
            <div className="track">
              <span>Apply</span><span>Queue and design</span><span>Equipment and upgrades</span><span>Connect</span>
            </div>
            <p>Can take years where the network is full.</p>
          </div>
          <div className="path fast">
            <span className="eyebrow">Existing supply, through PowerSite</span>
            <div className="track">
              <span>Find a matched site</span><span>Pad and cabling</span><span>Connect</span>
            </div>
            <p>The transformer and connection are already there and paid for. If there's spare headroom, it's mostly site works and approvals.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** After the stats: where the spare power is, and why nobody can find it. */
function Opportunity() {
  return (
    <section className="problem">
      <div className="in">
        <div className="sechead">
          <span className="eyebrow">The opportunity</span>
          <h2>The power already exists. Nobody can find it.</h2>
        </div>
        <ol className="probs">
          <li>
            <b>Connected supply sits unused</b>
            <p>
              Factories shrink, cold stores close and depots run below what they were built for. Their supply stays connected
              and paid for, but mostly idle. Regional networks have room too: Essential Energy told the NSW inquiry its network
              is "underutilised".<Src n={2} />
            </p>
          </li>
          <li>
            <b>Nobody lists it</b>
            <p>
              Network capacity maps show substations, not a carpark corner you can lease. Property listings give square metres,
              not kVA. Big brokers chase hyperscale sites.
            </p>
          </li>
          <li>
            <b>So the match never happens</b>
            <p>
              A developer who needs 200 kVA and four car bays has no way to find the owner who has exactly that, and the owner
              doesn't know it's worth anything.
            </p>
          </li>
        </ol>
        <p className="probclose">
          PowerSite finds the space where the power is already there, checks how much is spare, and introduces the owner to
          the developer who needs it.
        </p>
      </div>
    </section>
  );
}

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
      <Problem />
      <Html html={stats} />
      <Opportunity />
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
