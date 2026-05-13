import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // native modules (better-sqlite3) run only in Node.js route handlers
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
