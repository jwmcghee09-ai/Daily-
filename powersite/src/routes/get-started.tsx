import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Site, Html, PageHead } from "@/components/Site";
import { forms, formsJs } from "@/content/fragments";

export const Route = createFileRoute("/get-started")({
  head: () => ({
    meta: [
      { title: "List your space or find space — PowerSite" },
      { name: "description", content: "List spare space with power for free, or send your power and space requirements." },
      { property: "og:title", content: "List your space or find space — PowerSite" },
      { property: "og:description", content: "List spare space with power for free, or send your power and space requirements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GetStarted,
});

function GetStarted() {
  useEffect(() => {
    // Sign-ups POST to a form service (e.g. Formspree). Set VITE_FORM_ENDPOINT to turn the forms on.
    new Function("FORM_ENDPOINT", formsJs)(import.meta.env["VITE_FORM_ENDPOINT"] ?? "");
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return (
    <Site>
      <PageHead eyebrow="Get started" title="List your space or find space" intro="Free to list. Takes two minutes." />
      <Html html={forms} />
    </Site>
  );
}
