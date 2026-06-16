"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message ?? "Could not change password." });
      return;
    }
    setMsg({ ok: true, text: "Password updated." });
    setCurrent("");
    setNext("");
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
      <input
        type="password"
        placeholder="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
        autoComplete="current-password"
      />
      <input
        type="password"
        placeholder="New password (min 8)"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        minLength={8}
        required
        autoComplete="new-password"
      />
      {msg && <div className={msg.ok ? "muted" : "error"}>{msg.text}</div>}
      <button type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}
