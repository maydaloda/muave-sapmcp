/**
 * Minimal email sender. Uses Resend's REST API when RESEND_API_KEY is set
 * (no dependency — plain fetch); otherwise logs to the server console so local
 * dev and unconfigured deployments still work. Never throws.
 */
type SendArgs = { to: string; subject: string; html: string; text?: string };

const FROM = process.env.RESEND_FROM ?? "muave-sapmcp <onboarding@resend.dev>";

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email:dev] to=${to} subject=${JSON.stringify(subject)}\n${text ?? html}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html, text }),
    });
    if (!res.ok) {
      console.error(`[email] Resend failed ${res.status}: ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error(`[email] send error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
