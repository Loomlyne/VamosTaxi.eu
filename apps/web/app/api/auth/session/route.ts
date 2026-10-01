// apps/web/app/api/auth/session/route.ts
//
// Minimal session snapshot for the header's client control. Any script on the
// page can read this response, so it carries only the signed-in customer's own
// account display fields: signedIn, displayName, email, emailConfirmed, phone, and (27.1) whether
// the account must still finish (finishRequired). It never
// includes a user id, token, role claim, or timestamp.
//
// D-03: getUser() only — never the cookie-only session helper. Middleware matcher excludes /api,
// so this handler builds its own server client. Missing or invalid session is
// the signed-out snapshot at 200, not an auth-failure status, because the
// header asks on every public page and a console error on every anonymous load
// would hide real failures.
//
// emailConfirmed is derived from User.email_confirmed_at on @supabase/ssr 0.12.5
// (@supabase/auth-js 2.112.4 User).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { mustFinish } from "@/lib/auth/finish-target";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DISPLAY_NAME_MAX = 80;

export type SessionSnapshot = {
  signedIn: boolean;
  displayName: string | null;
  email: string | null;
  emailConfirmed: boolean;
  phone: string | null;
  /** 27.1: the account must still finish (name, optional phone, the tick). Only read with ?finish=1; false when not asked or the read fails. */
  finishRequired: boolean;
};

const SIGNED_OUT: SessionSnapshot = {
  signedIn: false,
  displayName: null,
  email: null,
  emailConfirmed: false,
  phone: null,
  finishRequired: false,
};

function displayNameFromMetadata(metadata: Record<string, unknown>): string | null {
  const raw = metadata.full_name;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > DISPLAY_NAME_MAX ? trimmed.slice(0, DISPLAY_NAME_MAX) : trimmed;
}

function phoneFromMetadata(metadata: Record<string, unknown>): string | null {
  const raw = metadata.phone;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 32) return null;
  return trimmed;
}

function snapshotResponse(body: SessionSnapshot): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient(request);
    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : data.user;
    if (!user) return snapshotResponse(SIGNED_OUT);

    const metadata = user.user_metadata as Record<string, unknown> | undefined;
    // Asked only with ?finish=1 (the account page and the finish step), so the header's call on
    // every public page stays one Auth read with no database query.
    const asked = new URL(request.url).searchParams.get("finish") === "1";
    const finishRequired = asked
      ? await mustFinish(getCloudflareContext().env, user.id, {
          requestId: crypto.randomUUID(),
          route: "/api/auth/session",
          locale: null,
        })
      : false;
    return snapshotResponse({
      signedIn: true,
      displayName: metadata ? displayNameFromMetadata(metadata) : null,
      email: user.email ?? null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      phone: metadata ? phoneFromMetadata(metadata) : null,
      finishRequired,
    });
  } catch {
    log(
      "warn",
      "auth",
      { requestId: crypto.randomUUID(), route: "/api/auth/session", locale: null },
      { reason: "snapshot-failed" },
    );
    return snapshotResponse(SIGNED_OUT);
  }
}
