// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// STATIC_BASE builds a plain static site (every page prerendered to HTML) served from a
// sub-path, e.g. STATIC_BASE=/Daily-/powersite/ for GitHub Pages. Unset = normal Lovable build.
const staticBase = process.env["STATIC_BASE"];

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(staticBase && {
      prerender: { enabled: true, crawlLinks: true, autoSubfolderIndex: true },
    }),
  },
  ...(staticBase && { vite: { base: staticBase }, nitro: false }),
});
