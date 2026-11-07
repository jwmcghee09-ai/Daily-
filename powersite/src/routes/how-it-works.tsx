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

function How() {
  return (
    <Site>
      <PageHead eyebrow="How it works" title="Two sides, one match" intro="Owners list spare space with power. Renters tell us what they need. We check the power and make the introduction." />
      <Html html={how} />
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
