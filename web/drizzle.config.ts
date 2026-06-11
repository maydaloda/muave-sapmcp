import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Used by `drizzle-kit migrate` against the real database (Neon/Postgres).
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/muave",
  },
});
