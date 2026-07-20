import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The projection shards are read from disk at runtime: make sure they are
  // bundled with the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/projection": ["./data/projections/**/*"],
  },
};

export default nextConfig;
