import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The projection shards are read from disk at runtime: make sure they are
  // bundled with the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/projection": ["./data/projections/**/*"],
    "/api/departements": ["./data/refdata/departements.geojson"],
    "/api/transition": ["./data/refdata/zre-communes.json"],
    "/api/restrictions": ["./data/restrictions/guide.json", "./data/restrictions/zones/**/*"],
    "/api/swi": ["./data/swi/cells.json", "./data/swi/meta.json", "./data/swi/clim/**/*"],
  },
};

export default nextConfig;
