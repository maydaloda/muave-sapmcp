// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // web/ is the Vercel app with its own toolchain (Next.js lint/typecheck in its
    // own package + CI job) — the root config covers the npm package only.
    ignores: ["dist/**", "node_modules/**", "coverage/**", "web/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // stdout is reserved for JSON-RPC framing on the stdio transport.
      // All diagnostic output must go through the pino logger (stderr).
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Tests and dev tooling (not shipped) may use console + Node globals.
    files: ["test/**/*.{ts,mjs,js}", "tools/**/*.{ts,mjs,js}", "*.config.{js,ts,mjs}"],
    languageOptions: { sourceType: "module" },
    rules: {
      "no-console": "off",
      "no-undef": "off",
    },
  }
);
