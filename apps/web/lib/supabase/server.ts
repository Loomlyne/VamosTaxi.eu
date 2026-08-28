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
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function createServerSupabaseClient() {
  const { env } = getCloudflareContext();
  const cookieStore = await cookies();

  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
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
