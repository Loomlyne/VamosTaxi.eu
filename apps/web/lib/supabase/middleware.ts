// apps/web/lib/supabase/middleware.ts
//
// Session refresh onto an EXISTING NextResponse. Must never construct a
// response (D-02, opennextjs-cloudflare #498/#501). The `response` parameter
// is the instance handleI18nRouting() already produced.

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

function supabaseAuthEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (typeof url === "string" && url.length > 0 && typeof anonKey === "string" && anonKey.length > 0) {
    return { url, anonKey };
  }
  return { url: "http://127.0.0.1:54321", anonKey: "anon-placeholder" };
}

export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const { url, anonKey } = supabaseAuthEnv();
  const supabase = createServerClient(url, anonKey, {
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
