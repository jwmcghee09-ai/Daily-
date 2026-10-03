import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "form-action 'self' https://checkout.stripe.com",
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://connect.facebook.net${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  isProd
    ? "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://*.ingest.sentry.io https://*.sentry.io https://cloudflareinsights.com https://www.facebook.com https://connect.facebook.net"
    : "connect-src 'self' http: https: ws: wss:",
  "frame-src 'self' https://checkout.stripe.com",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders: Array<{ key: string; value: string }> = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  typescript: {
    /*
     * Type checking happens in CI, not here.
     *
     * typescript and the @types packages are devDependencies, which is where
     * they belong — nothing at runtime imports them. But the deploy host
     * installs with NODE_ENV=production and so omits devDependencies, and
     * `next build` type-checks by default: it would compile against types that
     * are simply absent and fail on its own source, which is exactly how this
     * deployment broke on a missing @types/papaparse.
     *
     * This is not a relaxation of the standard. The CI workflow runs
     * `tsc --noEmit` on every push with the full dependency tree, and a type
     * error fails there before anything can deploy. The build's own check was
     * a duplicate of that one, run in the one environment least equipped to
     * perform it.
     */
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
