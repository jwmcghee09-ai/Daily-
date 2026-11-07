import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Site, Html, PageHead } from "@/components/Site";
import { listings, listingsJs } from "@/content/fragments";

export const Route = createFileRoute("/spaces")({
  head: () => ({
    meta: [
      { title: "Spaces with spare power — PowerSite" },
      { name: "description", content: "Browse example carparks, yards, rooftops, buildings and land in NSW with spare power supply." },
      { property: "og:title", content: "Spaces with spare power — PowerSite" },
      { property: "og:description", content: "Browse example carparks, yards, rooftops, buildings and land in NSW with spare power supply." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Spaces,
});

function Spaces() {
  useEffect(() => new Function(listingsJs)() as (() => void) | undefined, []);
  return (
    <Site>
      <PageHead eyebrow="Listings" title="Spaces with spare power" intro="Carparks, yards, rooftops, buildings and land across NSW." />
      <Html html={listings} />
    </Site>
  );
}
