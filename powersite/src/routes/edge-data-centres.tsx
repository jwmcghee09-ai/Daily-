import { createFileRoute } from "@tanstack/react-router";
import { Site, Html } from "@/components/Site";
import { edge, sources } from "@/content/fragments";
import racks from "@/assets/racks.jpg";

export const Route = createFileRoute("/edge-data-centres")({
  head: () => ({
    meta: [
      { title: "Edge data centres in a shipping container — PowerSite" },
      { name: "description", content: "What an edge data centre is, how much space and power it needs, and how it fits into a carpark or yard." },
      { property: "og:title", content: "Edge data centres in a shipping container — PowerSite" },
      { property: "og:description", content: "What an edge data centre is, how much space and power it needs, and how it fits into a carpark or yard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Edge,
});

function Edge() {
  return (
    <Site>
      <header className="hero" style={{ minHeight: "70vh" }}>
        <div className="ph" style={{ backgroundImage: `url(${racks})` }} />
        <div className="in"><span className="eyebrow">Edge data centres</span><h1>Edge data centres in a shipping container</h1></div>
      </header>
      <Html html={edge} />
      <Html html={sources} />
    </Site>
  );
}
