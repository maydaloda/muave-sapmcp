import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Used by `drizzle-kit` against the real database. Pinned to Supabase: its
    // DIRECT (non-pooled) URL wins first, ahead of the legacy Neon
    // DATABASE_URL/POSTGRES_URL this project also carries.
    url:
      process.env.SUPABASE_POSTGRES_POSTGRES_URL_NON_POOLING ??
      process.env.SUPABASE_POSTGRES_POSTGRES_URL ??
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL_NON_POOLING ??
      process.env.POSTGRES_URL ??
      "postgres://localhost:5432/muave",
  },
});
