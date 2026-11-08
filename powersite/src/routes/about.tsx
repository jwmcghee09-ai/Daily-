import { createFileRoute, Link } from "@tanstack/react-router";
import { Site, PageHead, contactEmail } from "@/components/Site";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — PowerSite" },
      { name: "description", content: "Why PowerSite exists: new grid connections take years, so we find NSW space where the power is already connected." },
      { property: "og:title", content: "About — PowerSite" },
      { property: "og:description", content: "Why PowerSite exists: new grid connections take years, so we find NSW space where the power is already connected." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <Site>
      <PageHead
        eyebrow="About"
        title="The power is already there"
        intro="PowerSite started with a simple problem: the hardest part of a small energy or data project isn't the equipment. It's the grid connection."
      />
      <section>
        <div className="in prose">
          <h2>Why we started</h2>
          <p>
            We looked at a lot of ways to build small data centres: floating nodes, half-megawatt colocation, fuel cells. Every one
            hit the same wall. <b>A new grid connection can take years.</b> The equipment can be built and delivered in weeks.
          </p>
          <p>
            Meanwhile, plenty of carparks, factory yards, depots and closed buildings across NSW already have a large supply that's
            barely used. So instead of waiting for new power, PowerSite finds space where the power is already connected and matches
            it with the people who need it.
          </p>

          <h2>Who it's for</h2>
          <p>
            <b>Owners</b> of carpark corners, yards, depots, rooftops, empty buildings and land near substations, who'd like rent
            from space they aren't using. <b>Developers</b> installing container edge data centres, batteries, EV charging hubs and
            telco gear.
          </p>
          <p>
            We focus on projects from about <b>50 kVA to 10 MW</b>. That's too small for the big brokers to bother with, and those
            spaces are rarely listed anywhere. We find them through owners and agents and check the power before anyone signs.
          </p>

          <h2>Where we are</h2>
          <p>
            We're starting in NSW and signing up our first owners and developers now. The listings on this site are examples until
            the first real spaces are checked. Listing is free, and we only earn a fee when a lease or sale is signed.
          </p>

          <h2 id="contact">Get in touch</h2>
          <p>
            {contactEmail ? (
              <>Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>, or use the forms below.</>
            ) : (
              <>The quickest way to reach us is through the sign-up forms. We read every one.</>
            )}
          </p>
          <div className="ctas">
            <Link to="/get-started" hash="host" className="btn d">List your space</Link>
            <Link to="/get-started" hash="rent" className="btn o" style={{ color: "var(--ink)" }}>Find space</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
