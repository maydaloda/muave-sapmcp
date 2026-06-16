import type { ReactNode } from "react";
import Link from "next/link";
import { CopyButton } from "../_components/CopyButton";
import { RevealClient } from "../_components/RevealClient";
import { SapLogo, MuaveMark } from "../_components/SapLogo";

export const dynamic = "force-dynamic";

const MCP_URL = `${(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/mcp`;

function FlowDiagram() {
  const nodes: ReadonlyArray<readonly [string, string]> = [
    ["60", "claude.ai"],
    ["360", "muave.org"],
    ["660", "SAP S/4HANA"],
  ];
  return (
    <svg
      className="flow"
      viewBox="0 0 720 120"
      role="img"
      aria-label="Connection flow: claude.ai to muave.org to SAP S/4HANA"
    >
      <path className="flow-base" d="M150 60 H310 M410 60 H570" />
      <path className="flow-pulse" d="M150 60 H310 M410 60 H570" />
      {nodes.map(([cx, label]) => (
        <g key={label}>
          <rect
            className="flow-node"
            x={String(Number(cx) - 60)}
            y="36"
            width="120"
            height="48"
            rx="12"
          />
          <text className="flow-label" x={cx} y="64" textAnchor="middle">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

interface Step {
  title: string;
  body: ReactNode;
}

export default function ConnectPage() {
  const steps: Step[] = [
    {
      title: "Copy your connector URL",
      body: (
        <>
          <p>This is the address Claude connects to. It’s the same for every client.</p>
          <div className="copyfield">
            <code>{MCP_URL}</code>
            <CopyButton value={MCP_URL} />
          </div>
        </>
      ),
    },
    {
      title: "Open the connector settings in Claude",
      body: (
        <p>
          In <strong>claude.ai</strong> (or the desktop app), go to{" "}
          <strong>Settings → Connectors → Add custom connector</strong>.
        </p>
      ),
    },
    {
      title: "Paste the URL and add it",
      body: (
        <p>
          Paste the connector URL into <strong>Remote MCP server URL</strong>. Leave the optional{" "}
          <strong>OAuth Client ID / Secret</strong> empty — the connector registers itself
          automatically — then click <strong>Add</strong>.
        </p>
      ),
    },
    {
      title: "Sign in with your muave account",
      body: (
        <p>
          Claude opens this site’s sign-in page. Use the email and password your administrator gave
          you. You’ll only see the SAP systems your group is allowed to use.
        </p>
      ),
    },
    {
      title: "Start working with SAP",
      body: (
        <p>
          The SAP tools now appear in Claude. Try{" "}
          <em>“List my SAP systems and the registered services.”</em> — or ask Claude to query a
          business partner, material stock, a purchase requisition, and more.
        </p>
      ),
    },
  ];

  return (
    <main>
      <section className="hero" data-reveal>
        <div className="eyebrow">muave · sapmcp</div>
        <h1>Connect Claude to your SAP systems</h1>
        <p className="lead">
          A secure custom connector that brings your SAP S/4HANA Cloud data into Claude — governed
          by your administrator, read-only by default.
        </p>
        <div className="brandbar">
          <MuaveMark />
          <span className="dot" />
          <SapLogo height={30} />
        </div>
      </section>

      <section className="glass" data-reveal data-reveal-delay="80" style={{ padding: 24 }}>
        <FlowDiagram />
      </section>

      <div className="steps">
        {steps.map((s, i) => (
          <article
            key={s.title}
            className="glass glass--strong interactive step"
            data-reveal
            data-reveal-delay={String(120 + i * 90)}
          >
            <div className="num">{i + 1}</div>
            <div>
              <h3>{s.title}</h3>
              {s.body}
            </div>
          </article>
        ))}
      </div>

      <section
        className="glass"
        data-reveal
        style={{ padding: 24, marginBottom: 8 }}
      >
        <h3 style={{ marginTop: 0 }}>Using Claude Code or Claude Desktop instead?</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          The same connector URL works there too. In Claude Code:{" "}
          <code>claude mcp add --transport http muave-sap {MCP_URL}</code>, then run{" "}
          <code>/mcp</code> to sign in. In Claude Desktop: Settings → Connectors → Add custom
          connector with the same URL.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link href="/login">Sign in to manage your account →</Link>
        </p>
      </section>

      <RevealClient />
    </main>
  );
}
