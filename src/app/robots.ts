import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * Only the marketing pages are worth crawling. Everything behind sign-in
 * (/dashboard, /terminal, /research, /strategy, /trading, /settings) returns a
 * redirect or an empty shell to a crawler, and /api has nothing a search engine
 * should be asking for — indexing any of it just spends crawl budget on pages
 * that render nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/terminal", "/research", "/strategy", "/trading", "/settings"],
      },
    ],
    sitemap: "https://spectre-assets.com/sitemap.xml",
    host: "https://spectre-assets.com",
  };
}
