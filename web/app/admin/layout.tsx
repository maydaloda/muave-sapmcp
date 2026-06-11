import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?redirect_to=/admin");
  if (session.user.role !== "admin") redirect("/welcome");

  return (
    <>
      <nav className="top">
        <strong>muave-sapmcp admin</strong>
        <Link href="/admin">Users</Link>
        <Link href="/admin/groups">Groups</Link>
        <Link href="/admin/systems">Systems</Link>
        <span className="spacer" />
        <span className="muted">{session.user.email}</span>
      </nav>
      {children}
    </>
  );
}
