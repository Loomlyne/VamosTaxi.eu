// apps/web/lib/supabase/request.ts
//
// A server client for a plain Worker `Request`, outside Next (worker.ts runs before OpenNext, so
// neither next/headers nor NextResponse exists there). Same cookie name and attributes as the
// middleware and route clients (`authCookieOptions`); the Cookie header is read the way
// `createServerSupabaseClient` reads it (`cookieListFromHeader`). No `next/*` import on purpose:
// this module is bundled into the Worker entry itself.

import { createServerClient, serializeCookieHeader } from "@supabase/ssr";
import { authCookieOptions, cookieListFromHeader, isSecureRequest } from "./cookies";

export type RequestSupabaseCredentials = {
  url: string | undefined;
  anonKey: string | undefined;
};

/**
 * `supabase` reads the request's auth cookies. When Supabase writes cookies (it refreshed an
 * expired session), each one lands in `setCookies` as a ready `Set-Cookie` line: the caller puts
 * them on its answer, as the middleware copies `client.response`'s cookies onto every document.
 * Dropping them would leave the browser holding a refresh token Supabase already rotated.
 *
 * Null when the credentials are missing: the caller fails closed.
 */
export function createRequestSupabaseClient(
  request: Request,
  credentials: RequestSupabaseCredentials,
): { supabase: ReturnType<typeof createServerClient>; setCookies: string[] } | null {
  const { url, anonKey } = credentials;
  if (!url || !anonKey) return null;
  const secure = isSecureRequest({
    url: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
  });
  const setCookies: string[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions(secure),
    cookies: {
      getAll() {
        return cookieListFromHeader(request.headers.get("cookie"));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookies.push(serializeCookieHeader(name, value, options));
        }
      },
    },
  });
  return { supabase, setCookies };
}
