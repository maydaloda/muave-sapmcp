import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pino (used by muave-sapmcp) and pg are server-only CJS packages.
  serverExternalPackages: ["muave-sapmcp", "pino", "pg", "@electric-sql/pglite"],
};

export default nextConfig;
