"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setBusy(false);
    setSent(true); // generic success (anti-enumeration)
  }

  return (
    <main>
      <form className="glass login-card" onSubmit={submit}>
        <h1>Reset password</h1>
        {sent ? (
          <>
            <p className="muted">
              If that email belongs to an account, a reset link is on its way. Check your inbox.
            </p>
            <Link href="/login">Back to sign in</Link>
          </>
        ) : (
          <>
            <p className="muted">Enter your account email and we’ll send a reset link.</p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <Link href="/login" className="muted">
              Back to sign in
            </Link>
          </>
        )}
      </form>
    </main>
  );
}
