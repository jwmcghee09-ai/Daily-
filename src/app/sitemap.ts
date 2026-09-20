import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://spectre-assets.com";

/**
 * The publicly indexable surface. The app itself sits behind sign-in, so the
 * only pages a crawler can actually render are the landing page, the sign-in
 * entry point, and the legal pages Stripe and the app stores expect to find.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: BASE, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/signin`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
