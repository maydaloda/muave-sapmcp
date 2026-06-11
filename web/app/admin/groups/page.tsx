import { db, dbReady, schema } from "@/lib/db";
import { allSystemKeys } from "@/lib/systems";
import { createGroup, deleteGroup, setGroupSystems } from "../actions";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  await dbReady;
  const [groups, systemKeys] = await Promise.all([db.select().from(schema.groups), allSystemKeys()]);

  return (
    <main>
      <h1>Groups</h1>
      <p className="muted">
        A group grants its members access to the selected SAP systems (configured on the server via{" "}
        <code>MUAVE_SYSTEMS_JSON</code>). Configured systems: {systemKeys.join(", ") || "(none)"}.
      </p>

      <h2>Create group</h2>
      <form className="row panel" action={createGroup}>
        <input name="name" placeholder="Group name" required />
        <button type="submit">Create</button>
      </form>

      {groups.map((g) => {
        const allowAll = g.allowedSystems.includes("*");
        return (
          <div key={g.id} className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>{g.name}</h2>
            <form action={setGroupSystems}>
              <input type="hidden" name="groupId" value={g.id} />
              <label style={{ display: "block", marginBottom: 8 }}>
                <input type="checkbox" name="all" defaultChecked={allowAll} /> All systems (current and
                future)
              </label>
              {systemKeys.map((key) => (
                <label key={key} style={{ display: "inline-block", marginRight: 16 }}>
                  <input
                    type="checkbox"
                    name="systems"
                    value={key}
                    defaultChecked={!allowAll && g.allowedSystems.includes(key)}
                  />{" "}
                  {key}
                </label>
              ))}
              <div className="row" style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="submit">Save access</button>
              </div>
            </form>
            <form action={deleteGroup} style={{ marginTop: 8 }}>
              <input type="hidden" name="groupId" value={g.id} />
              <button className="danger" type="submit">
                Delete group
              </button>
            </form>
          </div>
        );
      })}
    </main>
  );
}
