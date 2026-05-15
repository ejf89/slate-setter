import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["better-sqlite3"],
  devIndicators: false,
};

export default nextConfig;
