// apps/web/lib/supabase/server.ts
//
// The ONLY place `@supabase/ssr` is constructed on the server. There is
// deliberately no browser twin — `scripts/public-env-allowlist.json` lists
// SUPABASE_URL and SUPABASE_ANON_KEY under forbidden_substrings, so a
// browser client cannot exist without amending that gate. Every auth call
// in Phase 5 runs in middleware, a Server Action, or a Route Handler.
//
// Out of scope: row-level app queries (Hyperdrive via lib/db), a browser
// client, getSession().

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { authCookieOptions, authCookiesFrom, isSecureRequest } from "./cookies";

/** One cookie `setAll` asked the server client to write. */
export type AuthSetCookie = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: boolean | "lax" | "strict" | "none";
    secure?: boolean;
  };
};

/**
 * Set-Cookie for one auth cookie. Shape matches the consent route: one
 * header string, attributes separated by "; ". The route appends each
 * string as its own Set-Cookie. cookies().set does not attach to a
 * hand-built Response on this Worker.
 */
export function authSetCookieHeader(cookie: AuthSetCookie): string {
  const parts = [`${cookie.name}=${encodeURIComponent(cookie.value)}`];
  const options = cookie.options ?? {};
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path ?? "/"}`);
  if (typeof options.maxAge === "number") parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires instanceof Date && !Number.isNaN(options.expires.getTime())) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite === true) parts.push("SameSite=Strict");
  else if (typeof options.sameSite === "string" && options.sameSite.length > 0) {
    const label = options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1).toLowerCase();
    parts.push(`SameSite=${label}`);
  }
  return parts.join("; ");
}

export async function createServerSupabaseClient(
  request?: Request,
  sink?: { cookies: AuthSetCookie[] },
) {
  const { env } = getCloudflareContext();
  const cookieStore = await cookies();
  const supabaseUrl = env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  let cookieHeader: string | null = request?.headers.get("cookie") ?? null;
  let forwardedProto: string | null = request?.headers.get("x-forwarded-proto") ?? null;
  let host: string | null = request?.headers.get("host") ?? null;
  if (!cookieHeader || !request) {
    try {
      const h = await headers();
      cookieHeader = cookieHeader ?? h.get("cookie");
      forwardedProto = forwardedProto ?? h.get("x-forwarded-proto");
      host = host ?? h.get("host");
    } catch {
      // no request scope: keep what the request itself gave
    }
  }
  const secure = isSecureRequest({ url: request?.url, forwardedProto, host });

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { experimental: { passkey: true } },
    cookieOptions: authCookieOptions(secure),
    cookies: {
      getAll() {
        return authCookiesFrom(cookieStore.getAll(), cookieHeader);
      },
      setAll(cookiesToSet) {
        if (sink) {
          for (const cookie of cookiesToSet) sink.cookies.push(cookie);
        }
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot mutate cookies. Middleware updateSession
          // is what keeps the session fresh in that case. Route handlers that
          // return Response.json must copy `sink` onto that response.
        }
      },
    },
  });
}

/**
 * A cookie-less server client for re-checking a credential (26.1 D-17 re-auth)
 * without touching the caller's session: it reads no request cookies and
 * writes none, so a sign-in on it never replaces the admin's session (or drops
 * it from aal2 to aal1). Callers sign the throwaway session out when done.
 */
export function createIsolatedSupabaseClient() {
  const { env } = getCloudflareContext();
  const supabaseUrl = env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server credentials are not configured.");
  }
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Deliberately dropped: this client's session must never reach the browser.
      },
    },
  });
}

/** Plan 06-02 name. Same factory — Phase 5 landed `createServerSupabaseClient`. */
export const createSupabaseServerClient = createServerSupabaseClient;
