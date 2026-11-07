import { createFileRoute, Link } from "@tanstack/react-router";
import { Site, PageHead } from "@/components/Site";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — PowerSite" },
      { name: "description", content: "Free for owners to list. A small finder's fee only when a lease or sale is signed. Developer access by subscription." },
      { property: "og:title", content: "Pricing — PowerSite" },
      { property: "og:description", content: "Free for owners to list. A small finder's fee only when a lease or sale is signed. Developer access by subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

const plans = [
  {
    who: "Space owners",
    price: "Free",
    unit: "to list",
    points: [
      "List carparks, yards, rooftops, buildings or land",
      "We estimate how much of your supply is spare",
      "We send you renters whose needs fit",
      "Nothing to pay unless a deal is signed",
    ],
    cta: { label: "List your space", hash: "host" },
  },
  {
    who: "Developers",
    price: "$200–500",
    unit: "a month",
    points: [
      "See new spaces before they're public",
      "Power, access and fibre details checked",
      "Alerts by region, size and kVA",
      "Pilot pricing, set with our first users",
    ],
    cta: { label: "Register interest", hash: "rent" },
    featured: true,
  },
  {
    who: "When a deal signs",
    price: "1–2%",
    unit: "finder's fee",
    points: [
      "Charged only on a signed lease or sale",
      "No fee for introductions that don't go ahead",
      "Covers checking the power and the introduction",
      "Feasibility reports coming later",
    ],
    cta: { label: "How it works", to: "/how-it-works" as const },
  },
];

function Pricing() {
  return (
    <Site>
      <PageHead
        eyebrow="Pricing"
        title="Free to list. Pay when it works."
        intro="Built for projects from about 50 kVA to 10 MW: the ones too small for the big brokers to bother with."
      />
      <section>
        <div className="in">
          <div className="types prices">
            {plans.map((p) => (
              <div key={p.who} className={`type price${p.featured ? " featured" : ""}`}>
                <span className="eyebrow">{p.who}</span>
                <div className="amt"><b>{p.price}</b> <span>{p.unit}</span></div>
                <ul>{p.points.map((x) => <li key={x}>{x}</li>)}</ul>
                {"to" in p.cta ? (
                  <Link to={p.cta.to} className="btn o">{p.cta.label}</Link>
                ) : (
                  <Link to="/get-started" hash={p.cta.hash} className={`btn ${p.featured ? "d" : "o"}`}>{p.cta.label}</Link>
                )}
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 32, fontSize: ".9rem", maxWidth: "70ch" }}>
            Prices are in AUD and exclude GST. Developer pricing is being set during the pilot, so early sign-ups help decide it.
          </p>
        </div>
      </section>
    </Site>
  );
}
