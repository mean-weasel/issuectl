import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@issuectl/core"],
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
    // 'unsafe-inline' on style-src is required by next/font (which
    // injects inline @font-face CSS) and React's runtime style hoisting.
    // 'unsafe-eval' on script-src is required by Next.js dev-mode HMR;
    // it is harmless in production builds where eval is not used by the
    // framework. img-src whitelists the GitHub avatar host already
    // configured under `images.remotePatterns` above. data: covers
    // inline SVG and base64 placeholders.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com",
      "font-src 'self'",
      "connect-src 'self'",
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

export default nextConfig;
