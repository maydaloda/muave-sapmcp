import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { allowedSystemsFor } from "@/lib/mcp-context";

export default async function Welcome() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const systems = await allowedSystemsFor(session.user.id);

  return (
    <main>
      <h1>muave-sapmcp</h1>
      <div className="panel">
        <p>
          Signed in as <strong>{session.user.email}</strong>.
        </p>
        <p>
          SAP systems available to you:{" "}
          {systems.length === 0 ? (
            <span className="error">none — ask an admin to assign you to a group.</span>
          ) : systems.includes("*") ? (
            <span className="badge">all systems</span>
          ) : (
            systems.map((s) => (
              <span key={s} className="badge">
                {s}
              </span>
            ))
          )}
        </p>
        <p className="muted">
          Connect from claude.ai → Settings → Connectors → Add custom connector with this server's
          URL: <code>{(process.env.BETTER_AUTH_URL ?? "http://localhost:3000") + "/api/mcp"}</code>
        </p>
      </div>
    </main>
  );
}
