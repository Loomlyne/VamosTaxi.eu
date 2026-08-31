import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createNavigation } from "next-intl/navigation";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { asStaff } from "@/lib/db/identity";
import { buildOpsNav } from "@/lib/ops/nav";
import { OpsAuthError, requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OpsShell } from "@/components/ops";

export const dynamic = "force-dynamic";

const { redirect } = createNavigation(routing);

const OPS_EXEMPT = new Set(["/ops/sign-in", "/ops/mfa-challenge", "/ops/accept-invite"]);

function opsPathFromHeaders(headerList: Headers): string {
  return headerList.get("x-vamos-ops-path") ?? "";
}

async function signOut() {
  "use server";
  const locale = await getLocale();
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect({ href: "/ops/sign-in", locale });
}

export default async function OpsLayout({ children }: { children: ReactNode }) {
  const headerList = await headers();
  const opsPath = opsPathFromHeaders(headerList);
  const locale = await getLocale();

  if (OPS_EXEMPT.has(opsPath)) {
    return <>{children}</>;
  }

  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  let claims;
  try {
    claims = await requireStaffClaims(supabase);
  } catch (error) {
    if (error instanceof OpsAuthError) {
      if (error.reason === "no-session") redirect({ href: "/ops/sign-in", locale });
      if (error.reason === "not-staff") redirect({ href: "/", locale });
      if (error.reason === "needs-mfa") redirect({ href: "/ops/mfa-challenge", locale });
    }
    throw error;
  }

  const role = claims.app_metadata?.vamos_role === "admin" ? "admin" : "dispatcher";
  const groups = buildOpsNav(role);

  let fullName = claims.email ?? "Staff";
  let avatarPath: string | null = null;
  try {
    const { env } = getCloudflareContext();
    const row = await asStaff(env, claims, async (sql) => {
      const rows = await sql<
        { full_name: string | null; avatar_path: string | null }[]
      >`select full_name, avatar_path from app.staff_self()`;
      return rows[0] ?? null;
    });
    if (row?.full_name) fullName = row.full_name;
    if (row?.avatar_path) avatarPath = row.avatar_path;
  } catch {
    // Hyperdrive is unavailable in some local runs — rail still renders from claims.
  }

  return (
    <OpsShell
      groups={groups}
      activePath={opsPath || "/ops"}
      staff={{ fullName, role, avatarPath }}
      signOut={signOut}
    >
      {children}
    </OpsShell>
  );
}
