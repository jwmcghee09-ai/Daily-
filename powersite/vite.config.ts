// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// STATIC_BASE builds a plain static site (every page prerendered to HTML) served from a
// sub-path, e.g. STATIC_BASE=/Daily-/powersite/ for GitHub Pages. Unset = normal Lovable build.
const staticBase = process.env["STATIC_BASE"];
// Full public address of the site, used for the share-preview image and sitemap.
const siteUrl = staticBase ? (process.env["SITE_ORIGIN"] ?? "https://jwmcghee09-ai.github.io") + staticBase : "";
const pages = ["", "spaces", "edge-data-centres", "how-it-works", "pricing", "about", "get-started"];

/** Writes sitemap.xml and robots.txt (pointing at it) into the static build. */
const sitemap: Plugin = {
  name: "powersite-sitemap",
  generateBundle() {
    if (!siteUrl || this.environment.name !== "client") return;
    const urls = pages.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`).join("\n");
    this.emitFile({ type: "asset", fileName: "sitemap.xml",
      source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
    this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n` });
  },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(staticBase && {
      prerender: { enabled: true, crawlLinks: true, autoSubfolderIndex: true },
    }),
  },
  plugins: [sitemap],
  vite: {
    define: { "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl) },
    ...(staticBase && { base: staticBase }),
  },
  ...(staticBase && { nitro: false as const }),
});
