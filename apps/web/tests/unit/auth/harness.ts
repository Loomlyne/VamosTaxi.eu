// Shared fakes for the /api/auth route tests: Cloudflare context, next/headers and
// @supabase/ssr. The fake Supabase client hands its `cookies.setAll` to the test so a
// test can simulate Supabase writing the PKCE verifier / session cookies.
import { vi } from "vitest";
import type { AuthSetCookie } from "@/lib/supabase/server";

type Fn = (...args: never[]) => unknown;

export const state = {
  env: {} as Record<string, unknown>,
  auth: {} as Record<string, Fn>,
  options: null as null | {
    cookies: { setAll: (c: AuthSetCookie[]) => void };
    cookieOptions?: Record<string, unknown>;
  },
  limiterCalls: [] as Array<{ name: string; key: string }>,
};

export function limiter(name: string, success = true) {
  return {
    limit: async ({ key }: { key: string }) => {
      state.limiterCalls.push({ name, key });
      return { success };
    },
  };
}

/** Writes cookies the way @supabase/ssr does: through the setAll it was given. */
export function writeCookies(...cookies: AuthSetCookie[]): void {
  state.options?.cookies.setAll(cookies);
}

export const ok = { data: { user: null, session: null }, error: null };

export function resetHarness(): void {
  state.limiterCalls = [];
  state.env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    QUOTE_RATE_LIMITER_BARE: limiter("quote-bare"),
    AUTH_RATE_LIMITER: limiter("auth"),
  };
  state.auth = {
    getUser: (async () => ({ data: { user: null }, error: null })) as Fn,
    getSession: (async () => ({ data: { session: null } })) as Fn,
    signOut: (async () => ({ error: null })) as Fn,
    signInWithPassword: (async () => ({ error: null })) as Fn,
    signUp: (async () => ({ error: null })) as Fn,
    signInWithOtp: (async () => ({ error: null })) as Fn,
    resetPasswordForEmail: (async () => ({ error: null })) as Fn,
    verifyOtp: (async () => ({ error: null })) as Fn,
    resend: (async () => ({ error: null })) as Fn,
    updateUser: (async () => ({ error: null })) as Fn,
  };
  state.options = null;
}
resetHarness();

export const cloudflareMock = {
  getCloudflareContext: () => ({ env: state.env }),
};

export const headersMock = {
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
  headers: async () => new Headers(),
};

export const ssrMock = {
  createServerClient: (
    _url: string,
    _key: string,
    options: NonNullable<typeof state.options>,
  ) => {
    state.options = options;
    const auth = new Proxy(
      {
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: "aal1", nextLevel: "aal1" },
          }),
        },
      } as Record<string, unknown>,
      {
        get: (target, prop: string) => target[prop] ?? state.auth[prop],
      },
    );
    return { auth };
  },
};

export function authPost(body: Record<string, unknown>, host = "vamostaxi.site"): Request {
  return new Request(`https://${host}/api/auth`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: `https://${host}`,
      "cf-connecting-ip": "203.0.113.9",
    },
    body: JSON.stringify(body),
  });
}

export function setCookieHeaders(res: Response): string[] {
  return res.headers.getSetCookie();
}

export const spy = vi.fn;
