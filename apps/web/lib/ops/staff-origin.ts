// apps/web/lib/ops/staff-origin.ts
//
// Quick 261003: the staff check `csrfForbiddenPublicOrStaff` asks for when a public
// money route (/api/checkout/price, /api/checkout/intent) is called from the dashboard
// Origin. Same gate as every /api/staff/* route (requireStaffClaims: a staff role, and
// aal2 once a factor exists). Any error, no session or a refused gate is `false`.

import { requireStaffClaims, type StaffAuthClient } from "./session";
import { createSupabaseServerClient } from "../supabase/server";

export type StaffClientFactory = (request: Request) => Promise<StaffAuthClient>;

const defaultFactory: StaffClientFactory = async (request) =>
  (await createSupabaseServerClient(request)) as unknown as StaffAuthClient;

/** True only when the request's own cookies carry a staff session that passes the staff gate. */
export async function requestHasStaffSession(
  request: Request,
  factory: StaffClientFactory = defaultFactory,
): Promise<boolean> {
  try {
    await requireStaffClaims(await factory(request));
    return true;
  } catch {
    return false;
  }
}
