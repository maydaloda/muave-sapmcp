"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token");
  const linkError = sp.get("error"); // "INVALID_TOKEN" when bad/expired
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (linkError || !token) {
    return (
      <main>
        <div className="glass login-card">
          <h1>Reset link invalid</h1>
          <p className="error">This reset link is invalid or has expired.</p>
          <Link href="/forgot-password">Request a new link</Link>
        </div>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await authClient.resetPassword({ newPassword: pw, token: token as string });
    setBusy(false);
    if (error) {
      setErr(error.message ?? "Reset failed");
      return;
    }
    router.push("/login");
  }

  return (
    <main>
      <form className="glass login-card" onSubmit={submit}>
        <h1>Set a new password</h1>
        <input
          type="password"
          placeholder="New password (min 8 characters)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          minLength={8}
          required
          autoFocus
        />
        {err && <div className="error">{err}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Set password"}
        </button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
