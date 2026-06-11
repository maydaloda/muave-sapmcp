import { createMcpHandler } from "mcp-handler";
import { registerAllTools } from "muave-sapmcp";
import { auth } from "@/lib/auth";
import { buildToolContext } from "@/lib/mcp-context";

/** Allow long SAP round-trips (Vercel Fluid compute). */
export const maxDuration = 300;

function unauthorized(): Response {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    },
  });
}

/**
 * The MCP endpoint (Streamable HTTP). Every request must carry a Bearer access
 * token issued by our better-auth OAuth provider; the tool context is built
 * per-request with the user's group-filtered system access.
 */
async function handler(req: Request): Promise<Response> {
  const session = await auth.api.getMcpSession({ headers: req.headers });
  if (!session) return unauthorized();

  const ctx = await buildToolContext(session.userId);
  const mcp = createMcpHandler(
    (server) => {
      registerAllTools(server as unknown as Parameters<typeof registerAllTools>[0], ctx);
    },
    {
      serverInfo: { name: "muave-sapmcp", version: "0.2.0" },
    },
    {
      basePath: "/api",
      maxDuration: 300,
      verboseLogs: false,
      disableSse: true,
    }
  );
  return mcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };
