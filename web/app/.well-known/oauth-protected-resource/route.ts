/** Protected-resource metadata (RFC 9728): tells MCP clients where to authenticate. */
export function GET(): Response {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return Response.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/maydaloda/muave-sapmcp",
  });
}
