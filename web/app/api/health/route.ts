/**
 * Deployment diagnostic: shows which configuration the running deployment sees.
 * Exposes the public base URL and PRESENCE booleans only — never secret values.
 */
export function GET(): Response {
  return Response.json({
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? null,
    trustedOrigins: process.env.MUAVE_TRUSTED_ORIGINS ?? null,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasAuthSecret: Boolean(process.env.BETTER_AUTH_SECRET),
    hasCredKey: Boolean(process.env.MUAVE_CRED_KEY),
    hasSystemsJson: Boolean(process.env.MUAVE_SYSTEMS_JSON),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  });
}
