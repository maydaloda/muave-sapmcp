"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { MuaveMark, SapLogo } from "../_components/SapLogo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message ?? "Sign-in failed");
      return;
    }
    // The MCP OAuth flow passes the URL to continue to after login.
    const next = params.get("redirect_to") ?? params.get("callbackURL") ?? "/";
    router.push(next);
  }

  return (
    <main>
      <form className="glass login-card" onSubmit={submit}>
        <div className="brandbar" style={{ marginTop: 0, marginBottom: 4 }}>
          <MuaveMark />
          <span className="dot" />
          <SapLogo height={26} />
        </div>
        <h1 style={{ margin: "4px 0 0" }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Access your SAP S/4HANA connector.
        </p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}
        >
          <Link href="/forgot-password" className="muted">
            Forgot password?
          </Link>
          <Link href="/connect" className="muted">
            How to connect →
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
