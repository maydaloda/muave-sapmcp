import { db, dbReady, schema } from "@/lib/db";
import { createUser, setUserGroup, setUserRole } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await dbReady;
  const [users, groups] = await Promise.all([
    db.select().from(schema.user),
    db.select().from(schema.groups),
  ]);

  return (
    <main>
      <h1>Users</h1>

      <h2>Create user</h2>
      <form className="row panel" action={createUser}>
        <input name="name" placeholder="Name" />
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password (min 8)" required minLength={8} />
        <select name="role" defaultValue="user">
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit">Create</button>
      </form>

      <h2>All users ({users.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>Group</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.name}</td>
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
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Admins always have access to all systems. Regular users get the systems of their group.
      </p>
    </main>
  );
}
