// apps/web/app/api/auth/session/route.ts
//
// Minimal session snapshot for the header's client control. Any script on the
// page can read this response, so it carries only what SiteHeaderAccount needs
// to choose a control: signedIn, displayName, emailConfirmed. It never includes
// an email address, user id, token, role claim, or timestamp.
//
// D-03: getUser() only — never the cookie-only session helper. Middleware matcher excludes /api,
// so this handler builds its own server client. Missing or invalid session is
// the signed-out snapshot at 200, not an auth-failure status, because the
// header asks on every public page and a console error on every anonymous load
// would hide real failures.
//
// emailConfirmed is derived from User.email_confirmed_at on @supabase/ssr 0.12.5
// (@supabase/auth-js 2.112.4 User).

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DISPLAY_NAME_MAX = 80;

export type SessionSnapshot = {
  signedIn: boolean;
  displayName: string | null;
  emailConfirmed: boolean;
};

const SIGNED_OUT: SessionSnapshot = {
  signedIn: false,
  displayName: null,
  emailConfirmed: false,
};

function displayNameFromMetadata(metadata: Record<string, unknown>): string | null {
  const raw = metadata.full_name;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > DISPLAY_NAME_MAX ? trimmed.slice(0, DISPLAY_NAME_MAX) : trimmed;
}

function snapshotResponse(body: SessionSnapshot): Response {
  return Response.json(body, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : data.user;
    if (!user) return snapshotResponse(SIGNED_OUT);

    const metadata = user.user_metadata as Record<string, unknown> | undefined;
    return snapshotResponse({
      signedIn: true,
      displayName: metadata ? displayNameFromMetadata(metadata) : null,
      emailConfirmed: Boolean(user.email_confirmed_at),
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
