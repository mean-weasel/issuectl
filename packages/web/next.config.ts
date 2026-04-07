import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@issuectl/core"],
  images: {
    remotePatterns: [
      { hostname: "avatars.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
