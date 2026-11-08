import { createFileRoute, Link } from "@tanstack/react-router";
import { Site, Html, PageHead } from "@/components/Site";
import { how } from "@/content/fragments";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — PowerSite" },
      { name: "description", content: "List spare space with power for free, or tell us your load and get introduced to matching owners." },
      { property: "og:title", content: "How it works — PowerSite" },
      { property: "og:description", content: "List spare space with power for free, or tell us your load and get introduced to matching owners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: How,
});

const faq: { group: string; items: [string, string][] }[] = [
  {
    group: "If you own the space",
    items: [
      ["Will this change my power bill?",
        "The renter pays for the power they use. Usually that means a separate meter or a sub-meter on your supply, set up by a licensed electrician before anything goes live. Your own usage and bill stay as they are."],
      ["Who pays for the cabling and concrete pad?",
        "The renter. Site works like the pad, cable run, fencing and fibre are part of their project cost. You agree to the works and where they go before anything starts."],
      ["Can I say no to a renter?",
        "Yes. Listing doesn't commit you to anything. You see who the renter is and what they want to install, and you decide whether to go ahead."],
      ["What about insurance, council approval and my lease?",
        "Every site is different. Most installs need some form of approval, and the renter normally arranges and pays for it. If you lease the site yourself, check your lease allows subletting. We'll point out what needs checking, but get your own advice before signing."],
      ["How do you know how much power is spare?",
        "We start from your supply size and your recent usage, then check the local network's published capacity data. It's an estimate until the network provider confirms it, and we say so on every listing."],
      ["What does it cost me?",
        "Nothing to list. A 1–2% finder's fee applies only if a lease or sale is signed."],
    ],
  },
  {
    group: "If you need space",
    items: [
      ["How big a project can you help with?",
        "About 50 kVA up to 10 MW: a single container data centre, a battery, a charging hub or a group of them. Bigger projects are better served by the large brokers."],
      ["How fast can I install?",
        "If the supply and space are already there, it's mostly down to the site works and approvals, often weeks to a few months. That's instead of the years a new grid connection can take."],
      ["Are the listings real?",
        "Not yet. The listings on the site are examples while we sign up our first owners. Send us your requirements and we'll tell you when real spaces that fit come in."],
      ["Where do you cover?",
        "NSW to start: Sydney, the Hunter, the Illawarra and regional NSW."],
    ],
  },
];

function How() {
  return (
    <Site>
      <PageHead eyebrow="How it works" title="Two sides, one match" intro="Owners list spare space with power. Renters tell us what they need. We check the power and make the introduction." />
      <Html html={how} />
      <section className="alt" id="faq">
        <div className="in">
          <div className="sechead"><span className="eyebrow">Questions</span><h2>What people ask us</h2></div>
          <div className="faq">
            {faq.map((g) => (
              <div key={g.group} style={{ display: "contents" }}>
                <h3>{g.group}</h3>
                {g.items.map(([q, a]) => (
                  <details key={q}><summary>{q}</summary><p>{a}</p></details>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="cta-band"><div className="in">
        <h2>Ready when you are</h2>
        <div className="ctas">
          <Link to="/get-started" hash="host" className="btn d">List your space</Link>
          <Link to="/get-started" hash="rent" className="btn o">Find space</Link>
        </div>
      </div></section>
    </Site>
  );
}
