// POST /api/staff/claim-invite
//
// The one self-only bridge for an active invitee before the custom access-token
// hook can mint a vamos_role. The SQL function scopes the write to app.uid() and
// stamps acceptance once. MFA is paused for V1.

import { staffOriginAllowed } from "@/lib/ops/staff-json";
import {
  authSetCookieHeader,
  createServerSupabaseClient,
  type AuthSetCookie,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(
  body: Record<string, boolean>,
  status: number,
  setCookies?: readonly AuthSetCookie[],
): Response {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  for (const cookie of setCookies ?? []) headers.append("Set-Cookie", authSetCookieHeader(cookie));
  return Response.json(body, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  if (!staffOriginAllowed(request.headers.get("Origin"))) {
    return json({ ok: false }, 403);
  }
  // refreshSession rotates the session. cookies().set does not attach to
  // Response.json on this Worker — copy the sink or the next /dashboard load
  // still holds the old cookie and middleware sends the operator back to /login.
  const setCookies: AuthSetCookie[] = [];
  const supabase = await createServerSupabaseClient(request, { cookies: setCookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false }, 401, setCookies);

  const { error } = await supabase.rpc("staff_claim_invite");
  if (error) return json({ ok: false }, 403, setCookies);

  // Acceptance changes what the custom access-token hook emits. Refresh in the
  // same cookie-backed request, before the DC login navigates to /dashboard.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) return json({ ok: false }, 403, setCookies);

  return json({ ok: true }, 200, setCookies);
}
