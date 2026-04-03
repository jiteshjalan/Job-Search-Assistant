import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Turbopack/webpack from bundling these CJS libraries.
  // They must be loaded natively by Node.js at runtime.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
