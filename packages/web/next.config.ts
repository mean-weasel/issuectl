import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import withSerwistInit from "@serwist/next";

// Pin the workspace root to the monorepo root so Next.js does not
// silently pick up a stray lockfile elsewhere on disk and emit the
// "inferred your workspace root" warning on every dev startup. The
// import.meta.url indirection keeps this resilient to where the
// command is run from.
const WORKSPACE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// NEXT_PUBLIC_APP_VERSION can be set externally (e.g. in a deploy workflow
// using the semantic-release tag like "v0.2.0"). Strip the leading "v" for
// display. In dev, fall back to the root package.json version.
const rawVersion =
  process.env.NEXT_PUBLIC_APP_VERSION ??
  JSON.parse(readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf-8")).version;
const appVersion = rawVersion.replace(/^v/, "");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  // Allow e2e tests to use an isolated output directory so their dev
  // server doesn't collide with the main dev server's .next/ cache.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  transpilePackages: ["@issuectl/core"],
  outputFileTracingRoot: WORKSPACE_ROOT,
  // Next.js 15 blocks cross-origin /_next/* requests in dev mode unless
  // the origin is listed here. issuectl is a single-user local tool that
  // is commonly accessed from a phone or tablet on the same LAN as the
  // host machine, so LAN IPs need to be allow-listed.
  //
  // NOTE: `allowedDevOrigins` expects literal hostnames or glob
  // wildcards — CIDR notation (e.g. "192.168.0.0/16") is NOT parsed and
  // silently fails to match. If you access the dev server from a device
  // whose LAN IP is not listed below, add it here and restart the dev
  // server. Localhost is implicit and does not need listing.
  allowedDevOrigins: ["192.168.1.30"],
  images: {
    remotePatterns: [
      { hostname: "avatars.githubusercontent.com" },
    ],
  },
  async headers() {
    // CSP is defense-in-depth — React's JSX escaping prevents the XSS
    // vectors that exist today, and there is no `dangerouslySetInnerHTML`
    // anywhere. The header limits the blast radius of any future DOM
    // manipulation or third-party script injection.
    //
    // 'unsafe-inline' on script-src is required by Next.js (App Router
    // emits inline hydration scripts on every SSR'd page; without
    // 'unsafe-inline' the browser refuses every one of them and
    // hydration silently fails — surfaced as ~30 CSP-violation entries
    // in the dev error indicator). The strict alternative is per-page
    // nonce-based CSP via middleware, which is significantly more
    // invasive; this matches the recommended next/security-headers
    // policy and the React docs' standard CSP example.
    //
    // 'unsafe-inline' on style-src is required by next/font (inline
    // @font-face CSS) and React's runtime style hoisting.
    //
    // 'unsafe-eval' on script-src is required by Next.js dev-mode HMR;
    // it is harmless in production where eval is not used by the
    // framework but kept for parity so dev/prod CSPs match.
    //
    // img-src whitelists the GitHub avatar host already configured
    // under `images.remotePatterns` above. data: covers inline SVG and
    // base64 placeholders.
    //
    // worker-src 'self' allows the Serwist-generated service worker
    // (sw.js) to register. Without an explicit directive, browsers
    // fall back to script-src — adding it prevents breakage if
    // script-src is ever tightened.
    // ttyd terminal iframes run on localhost ports 7700-7799. CSP
    // frame-src needs to allow these origins for the embedded terminal
    // panel to load. A single wildcard origin covers the entire range.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src http://localhost:*",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
