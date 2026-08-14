import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The projection shards are read from disk at runtime: make sure they are
  // bundled with the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/projection": ["./data/projections/**/*"],
    "/api/departements": ["./data/refdata/departements.geojson"],
    "/api/nappes": ["./data/refdata/nappes.geojson"],
    "/api/cours-eau": ["./data/refdata/cours-eau.geojson"],
    "/api/plans-eau": ["./data/refdata/plans-eau.geojson"],
    "/api/bassins-versants": ["./data/refdata/bassins-versants.geojson"],
    "/api/bassin-versant": ["./data/refdata/bassins-versants.geojson"],
    "/api/grands-bassins": ["./data/refdata/grands-bassins.geojson"],
    "/api/transition": ["./data/refdata/zre-communes.json", "./data/refdata/bassins-communes.json"],
    "/api/restrictions": ["./data/restrictions/guide.json", "./data/restrictions/zones/**/*"],
    "/api/swi": ["./data/swi/cells.json", "./data/swi/meta.json", "./data/swi/clim/**/*"],
  },
};

export default nextConfig;
