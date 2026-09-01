// POST /api/staff/claim-invite
//
// The one self-only bridge for an active invitee before the custom access-token
// hook can mint a vamos_role. The SQL function scopes the write to app.uid() and
// stamps acceptance once. MFA is paused for V1.

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(body: Record<string, boolean>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(): Promise<Response> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false }, 401);

  const { error } = await supabase.rpc("staff_claim_invite");
  if (error) return json({ ok: false }, 403);

  // Acceptance changes what the custom access-token hook emits. Refresh in the
  // same cookie-backed request, before the DC login navigates to dashboard /.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) return json({ ok: false }, 403);

  return json({ ok: true }, 200);
}
