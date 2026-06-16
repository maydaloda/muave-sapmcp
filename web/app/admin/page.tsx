import { db, dbReady, schema } from "@/lib/db";
import { RevealClient } from "../_components/RevealClient";
import {
  adminResetUserPassword,
  adminUnlockUser,
  createUser,
  setUserGroup,
  setUserRole,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await dbReady;
  const [users, groups] = await Promise.all([
    db.select().from(schema.user),
    db.select().from(schema.groups),
  ]);
  const now = Date.now();

  return (
    <main>
      <h1 data-reveal>Users</h1>

      <section className="glass" data-reveal data-reveal-delay="60" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Create user</h2>
        <form className="row" action={createUser}>
          <input name="name" placeholder="Name" />
          <input name="email" type="email" placeholder="Email" required />
          <input
            name="password"
            type="password"
            placeholder="Password (min 8)"
            required
            minLength={8}
          />
          <select name="role" defaultValue="user">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit">Create</button>
        </form>
      </section>

      <section className="glass glass--strong" data-reveal data-reveal-delay="120" style={{ padding: 20, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>All users ({users.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Group</th>
              <th>Status</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const locked = u.lockedUntil && u.lockedUntil.getTime() > now;
              return (
                <tr key={u.id}>
                  <td>
                    {u.email}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {u.name}
                    </div>
                  </td>
                  <td>
                    <form className="row" action={setUserRole}>
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="role" defaultValue={u.role ?? "user"}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                      <button className="secondary" type="submit">
                        Set
                      </button>
                    </form>
                  </td>
                  <td>
                    <form className="row" action={setUserGroup}>
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="groupId" defaultValue={u.groupId ?? ""}>
                        <option value="">(no group — no access)</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <button className="secondary" type="submit">
                        Assign
                      </button>
                    </form>
                  </td>
                  <td>
                    {locked ? (
                      <form className="row" action={adminUnlockUser}>
                        <span className="badge" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                          locked
                        </span>
                        <input type="hidden" name="userId" value={u.id} />
                        <button className="secondary" type="submit">
                          Unlock
                        </button>
                      </form>
                    ) : (
                      <span className="muted">
                        active
                        {(u.failedLoginAttempts ?? 0) > 0 ? ` (${u.failedLoginAttempts} fails)` : ""}
                      </span>
                    )}
                  </td>
                  <td>
                    <form className="row" action={adminResetUserPassword}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input
                        name="newPassword"
                        type="password"
                        placeholder="New password"
                        minLength={8}
                        required
                        size={14}
                      />
                      <button className="secondary" type="submit">
                        Reset
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted">
          Admins always have access to all systems. Accounts lock after 5 failed sign-ins for 15
          minutes; reset a password or unlock an account here.
        </p>
      </section>

      <RevealClient />
    </main>
  );
}
