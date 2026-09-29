// apps/web/lib/supabase/middleware.ts
//
// Session refresh onto an EXISTING NextResponse. Must never construct a
// response (D-02, opennextjs-cloudflare #498/#501). The `response` parameter
// is the instance handleI18nRouting() already produced.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, isSecureRequest } from "./cookies";

function supabaseAuthEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (typeof url === "string" && url.length > 0 && typeof anonKey === "string" && anonKey.length > 0) {
    return { url, anonKey };
  }
  return { url: "http://127.0.0.1:54321", anonKey: "anon-placeholder" };
}

function secureFor(request: NextRequest): boolean {
  return isSecureRequest({
    url: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
  });
}

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const { url, anonKey } = supabaseAuthEnv();
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: authCookieOptions(secureFor(request)),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

/**
 * Cookie-setting factory for callers that do not already have a response
 * (invite/sign-in redirects). Staff sessions are the most likely to chunk
 * because their JWT carries role + aal + amr. Writes must land on a
 * NextResponse.next({ request }) clone — constructing a response with a body
 * in a cookie-setting path triggers the Set-Cookie folding bug
 * (opennextjs/opennextjs-cloudflare#501). `updateSession` above stays the
 * Phase 5 path: it never constructs a response at all.
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  const box: { response: NextResponse } = {
    response: NextResponse.next({ request }),
  };
  const { url, anonKey } = supabaseAuthEnv();
  const supabase = createServerClient(url, anonKey, {
    // Passkey sign-in and the settings pane use auth.passkey.
    auth: { experimental: { passkey: true } },
    cookieOptions: authCookieOptions(secureFor(request)),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        box.response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          box.response.cookies.set(name, value, options);
        });
      },
    },
  });
  return {
    supabase,
    get response() {
      return box.response;
    },
  };
}
