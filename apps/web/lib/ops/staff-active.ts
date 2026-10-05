// apps/web/lib/ops/staff-active.ts
//
// Security S13 (2026-10-05): the staff gate read the role from the access token only. The token
// hook mints that role for an active, accepted staff row, but a token already issued keeps it until
// it expires (up to an hour), so a staff row switched to `active = false` kept working in every
// route that does its work as vamos_system or with Stripe. This asks the database on each staff
// call: `app.is_staff()` is the same rule the row-level policies use (role claim, an active and
// accepted staff row, aal2 once a verified factor exists).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff, type VamosClaims } from "@/lib/db/identity";

// Library module — D-06 greps asStaff/identity importers for this export.
export const dynamic = "force-dynamic";

/** True only while the caller's own staff row is active and accepted. Throws when the database cannot answer. */
export async function staffRowActive(claims: VamosClaims, env?: CloudflareEnv): Promise<boolean> {
  const bindings = env ?? (getCloudflareContext().env as CloudflareEnv);
  return asStaff(bindings, claims, async (sql) => {
    const rows = await sql<{ active: boolean | null }[]>`select app.is_staff() as active`;
    return rows[0]?.active === true;
  });
}
