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
import { authCookiesFrom } from "./cookies";

export async function createServerSupabaseClient(request?: Request) {
  const { env } = getCloudflareContext();
  const cookieStore = await cookies();
  const supabaseUrl = env.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  let cookieHeader: string | null = request?.headers.get("cookie") ?? null;
  if (!cookieHeader) {
    try {
      cookieHeader = (await headers()).get("cookie");
    } catch {
      cookieHeader = null;
    }
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { experimental: { passkey: true } },
    cookies: {
      getAll() {
        return authCookiesFrom(cookieStore.getAll(), cookieHeader);
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot mutate cookies. Middleware updateSession
          // is what keeps the session fresh in that case.
        }
      },
    },
  });
}

/** Plan 06-02 name. Same factory — Phase 5 landed `createServerSupabaseClient`. */
export const createSupabaseServerClient = createServerSupabaseClient;
