import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { allowedSystemsFor } from "@/lib/mcp-context";
import { ChangePassword } from "../_components/ChangePassword";
import { RevealClient } from "../_components/RevealClient";
import { MuaveMark, SapLogo } from "../_components/SapLogo";

const MCP_URL = `${(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/mcp`;

export default async function Welcome() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const systems = await allowedSystemsFor(session.user.id);

  return (
    <main>
      <section className="hero" data-reveal style={{ paddingBottom: 8 }}>
        <div className="brandbar" style={{ marginTop: 0 }}>
          <MuaveMark />
          <span className="dot" />
          <SapLogo height={28} />
        </div>
        <h1 style={{ fontSize: "clamp(24px,4vw,34px)" }}>Welcome, {session.user.name}</h1>
        <p className="lead">Your SAP S/4HANA connector is ready.</p>
      </section>

      <section className="glass glass--strong" data-reveal data-reveal-delay="80" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Your SAP access</h2>
        <p>
          {systems.length === 0 ? (
            <span className="error">No systems yet — ask an administrator to assign you to a group.</span>
          ) : systems.includes("*") ? (
            <>
              <span className="badge">all systems</span>
              <span className="muted"> (administrator)</span>
            </>
          ) : (
            systems.map((s) => (
              <span key={s} className="badge">
                {s}
              </span>
            ))
          )}
        </p>
      </section>

      <section className="glass interactive" data-reveal data-reveal-delay="140" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Connect from Claude</h2>
        <p className="muted">Add this connector URL in Claude → Settings → Connectors:</p>
        <p>
          <code
            style={{
              display: "inline-block",
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(0,0,0,0.28)",
              border: "1px solid var(--glass-border)",
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
            }}
          >
            {MCP_URL}
          </code>
        </p>
        <p style={{ marginBottom: 0 }}>
          <Link href="/connect">Step-by-step guide →</Link>
          {session.user.role === "admin" && (
            <>
              {"   "}
              <Link href="/admin" style={{ marginLeft: 16 }}>
                Admin console →
              </Link>
            </>
          )}
        </p>
      </section>

      <section className="glass" data-reveal data-reveal-delay="200" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Change your password</h2>
        <ChangePassword />
      </section>

      <RevealClient />
    </main>
  );
}
