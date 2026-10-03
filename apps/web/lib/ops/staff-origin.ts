// apps/web/lib/ops/staff-origin.ts
//
// Quick 261003: the staff check `csrfForbiddenPublicOrStaff` asks for when a public
// money route (/api/checkout/price, /api/checkout/intent) is called from the dashboard
// Origin. Same gate as every /api/staff/* route (requireStaffClaims: a staff role, and
// aal2 once a factor exists). Any error, no session or a refused gate is `false`.

import { requireStaffClaims, type StaffAuthClient } from "./session";
import { authSetCookieHeader, createSupabaseServerClient, type AuthSetCookie } from "../supabase/server";

/** Where the Supabase client puts the cookies it wants to write (a refreshed, rotated session). */
export type AuthCookieSink = { cookies: AuthSetCookie[] };

export type StaffClientFactory = (request: Request, sink?: AuthCookieSink) => Promise<StaffAuthClient>;

const defaultFactory: StaffClientFactory = async (request, sink) =>
  (await createSupabaseServerClient(request, sink)) as unknown as StaffAuthClient;

/**
 * True only when the request's own cookies carry a staff session that passes the staff gate.
 *
 * Quick 261003 review: checking the session can refresh it, and Supabase rotates the refresh
 * token. On this Worker `cookies().set` does not reach a hand-built Response, so a caller that
 * answers with its own Response must pass `sink` and copy each cookie with `copyAuthCookies`;
 * otherwise the browser keeps a refresh token that is already spent and is signed out.
 */
export async function requestHasStaffSession(
  request: Request,
  factory: StaffClientFactory = defaultFactory,
  sink?: AuthCookieSink,
): Promise<boolean> {
  try {
    await requireStaffClaims(await factory(request, sink));
    return true;
  } catch {
    return false;
  }
}

/** Appends one Set-Cookie per sink cookie to `response` and returns it. */
export function copyAuthCookies(response: Response, sink: AuthCookieSink): Response {
  for (const cookie of sink.cookies) response.headers.append("Set-Cookie", authSetCookieHeader(cookie));
  return response;
}
