import { db, dbReady, schema } from "@/lib/db";
import { credKeyConfigured } from "@/lib/crypto";
import { getShared } from "@/lib/systems";
import { createSystem, deleteSystem, testSystem, toggleSystemWrites, updateSystem } from "./actions";

export const dynamic = "force-dynamic";

const TEST_LABEL: Record<string, string> = {
  ok: "✓ reachable, credentials accepted",
  "reachable-403": "✓ credentials accepted (403 on probe path — likely fine, scenario-gated)",
  "auth-failed": "✗ 401 — credentials rejected",
  unreachable: "✗ network unreachable / timeout",
};

export default async function SystemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await dbReady;
  const params = await searchParams;
  const keyReady = credKeyConfigured();
  const [shared, dbRows] = await Promise.all([getShared(), db.select().from(schema.sapSystems)]);

  const testKey = params.test;
  const testResult = params.result ? (TEST_LABEL[params.result] ?? params.result) : null;

  return (
    <main>
      <h1>SAP systems</h1>

      {testKey && testResult && (
        <div className="glass glass--strong" style={{ padding: 20, marginBottom: 16 }}>
          Connection test <strong>{testKey}</strong>: {testResult}
        </div>
      )}

      {params.updated && (
        <div className="glass glass--strong" style={{ padding: 20, marginBottom: 16 }}>
          Updated <strong>{params.updated}</strong> — configuration saved (any new credentials are encrypted).
        </div>
      )}

      <h2>From server configuration (env)</h2>
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Base URL</th>
            <th>Auth</th>
            <th>Writes</th>
          </tr>
        </thead>
        <tbody>
          {shared.envFile.systems.map((s) => (
            <tr key={s.key}>
              <td>{s.key}</td>
              <td className="muted">{s.baseUrl}</td>
              <td>{s.authType}</td>
              <td>{s.readOnly ? "read-only" : "enabled"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Env-defined systems are managed via MUAVE_SYSTEMS_JSON and shown here read-only.</p>

      <h2>Admin-managed (database, credentials encrypted)</h2>
      {!keyReady ? (
        <div className="glass glass--strong" style={{ padding: 20 }}>
          <p className="error">
            MUAVE_CRED_KEY is not configured — adding systems is disabled.
          </p>
          <p className="muted">
            Generate a key with <code>openssl rand -base64 32</code> and set it as a{" "}
            <strong>Sensitive</strong> environment variable, then redeploy.
          </p>
        </div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Base URL</th>
                <th>Auth</th>
                <th>Credentials</th>
                <th>Writes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dbRows.map((s) => (
                <tr key={s.key}>
                  <td>{s.key}</td>
                  <td className="muted">{s.baseUrl}</td>
                  <td>{s.authType}</td>
                  <td className="muted">stored ✓ (write-only)</td>
                  <td>
                    <form action={toggleSystemWrites} style={{ display: "inline" }}>
                      <input type="hidden" name="key" value={s.key} />
                      <input type="hidden" name="readOnly" value={String(!s.readOnly)} />
                      <button className="secondary" type="submit">
                        {s.readOnly ? "read-only → enable writes" : "writes ENABLED → make read-only"}
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={testSystem} style={{ display: "inline", marginRight: 6 }}>
                      <input type="hidden" name="key" value={s.key} />
                      <button className="secondary" type="submit">
                        Test
                      </button>
                    </form>
                    <form action={deleteSystem} style={{ display: "inline" }}>
                      <input type="hidden" name="key" value={s.key} />
                      <button className="danger" type="submit">
                        Delete
                      </button>
                    </form>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer" }}>Update / replace credentials</summary>
                      <form
                        action={updateSystem}
                        className="glass"
                        style={{ padding: 12, marginTop: 8, display: "grid", gap: 6, maxWidth: 420 }}
                      >
                        <input type="hidden" name="key" value={s.key} />
                        <input name="name" defaultValue={s.name ?? ""} placeholder="Display name" />
                        <input name="baseUrl" defaultValue={s.baseUrl} placeholder="https://…" />
                        <input name="sapClient" defaultValue={s.sapClient ?? ""} placeholder="sap-client (optional)" />
                        {s.authType === "BASIC" ? (
                          <>
                            <input name="user" placeholder="New communication user" autoComplete="off" />
                            <input
                              name="password"
                              type="password"
                              placeholder="New password"
                              autoComplete="new-password"
                            />
                          </>
                        ) : (
                          <>
                            <input name="tokenUrl" defaultValue={s.tokenUrl ?? ""} placeholder="OAUTH2 token URL" />
                            <input name="clientId" placeholder="New client id" autoComplete="off" />
                            <input
                              name="clientSecret"
                              type="password"
                              placeholder="New client secret"
                              autoComplete="new-password"
                            />
                          </>
                        )}
                        <button type="submit">Save changes</button>
                        <span className="muted" style={{ fontSize: 12 }}>
                          Leave credential fields blank to keep the current ones. authType ({s.authType}) can’t be
                          changed here — delete &amp; re-add to switch.
                        </span>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Add system</h2>
          <form className="glass glass--strong" style={{ padding: 20 }} action={createSystem}>
            <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input name="key" placeholder="Key (e.g. DEVSYS)" required pattern="[A-Za-z0-9_-]{2,40}" />
              <input name="name" placeholder="Display name" />
              <input name="baseUrl" placeholder="https://myXXXXXX-api.s4hana.cloud.sap" required style={{ minWidth: 320 }} />
              <input name="sapClient" placeholder="sap-client (optional)" size={14} />
              <select name="authType" defaultValue="BASIC">
                <option value="BASIC">BASIC</option>
                <option value="OAUTH2">OAUTH2</option>
              </select>
            </div>
            <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input name="user" placeholder="BASIC: communication user" autoComplete="off" />
              <input name="password" type="password" placeholder="BASIC: password" autoComplete="new-password" />
            </div>
            <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <input name="tokenUrl" placeholder="OAUTH2: token URL (https://…/sap/bc/sec/oauth2/token)" style={{ minWidth: 380 }} />
              <input name="clientId" placeholder="OAUTH2: client id" autoComplete="off" />
              <input name="clientSecret" type="password" placeholder="OAUTH2: client secret" autoComplete="new-password" />
            </div>
            <label style={{ display: "block", margin: "10px 0" }}>
              <input type="checkbox" name="enableWrites" /> Enable writes (default is read-only)
            </label>
            <button type="submit">Add system (credentials encrypted)</button>
            <p className="muted">
              Credentials are AES-256-GCM encrypted with MUAVE_CRED_KEY before storage and can never be
              viewed again — only replaced. Fill the BASIC or OAUTH2 fields matching the selected auth type.
            </p>
          </form>
        </>
      )}
    </main>
  );
}
