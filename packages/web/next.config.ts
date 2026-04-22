import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

// Resolve the app version. Priority:
// 1. NEXT_PUBLIC_APP_VERSION env var (set in CI/deploy workflows)
// 2. Latest git tag (accurate in dev as long as tags are fetched)
// 3. Root package.json version (last-resort fallback)
function resolveVersion(): string {
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION.replace(/^v/, "");
  }
  try {
    return execFileSync("git", ["tag", "--sort=-v:refname", "-l", "v*"], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf-8",
    }).split("\n")[0].trim().replace(/^v/, "");
  } catch {
    return JSON.parse(readFileSync(join(WORKSPACE_ROOT, "package.json"), "utf-8")).version;
  }
}
const appVersion = resolveVersion();

const nextConfig: NextConfig = {
  experimental: {
    // Keep Next.js 15's default of 0 seconds for the client Router
    // Cache on dynamic pages. This ensures mutations (create issue,
    // add comment, close issue) are immediately visible when
    // navigating back to the list. The Suspense skeleton provides
    // perceived performance during the server re-render.
    staleTimes: {
      dynamic: 0,
    },
  },
  serverActions: {
    // Next.js defaults to 1 MB for server action request bodies.
    // Image uploads from mobile phones are typically 3-8 MB, so the
    // default silently rejects them before the action code runs. This
    // matches the explicit 10 MB limit enforced in useImageUpload and
    // the uploadImage server action.
    bodySizeLimit: "10mb",
  },
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
    // Terminal iframes now route through the same-origin proxy at
    // /api/terminal/{port}/, so frame-src 'self' is sufficient.
    // connect-src 'self' covers the proxied WebSocket upgrades.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    // Terminal proxy routes serve ttyd HTML inside an iframe on the
    // dashboard. They need frame-ancestors 'self' (not 'none') and
    // X-Frame-Options: SAMEORIGIN (not DENY), otherwise the browser
    // blocks the embed.
    const terminalCsp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
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
      {
        // Terminal proxy routes serve ttyd HTML inside an iframe on the
        // dashboard. The later position overrides the catch-all above:
        // frame-ancestors changes from 'none' to 'self' and X-Frame-Options
        // changes from DENY to SAMEORIGIN so the browser allows the embed.
        source: "/api/terminal/:path*",
        headers: [
          { key: "Content-Security-Policy", value: terminalCsp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
