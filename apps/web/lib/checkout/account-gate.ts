// apps/web/lib/checkout/account-gate.ts
//
// PAY-time account choice (26.5 D-02, D-04, D-09, D-12, D-13).
//
// decideAccount is pure. runAccountGate runs the checks in a fixed order with
// injected deps: Turnstile (action account), the per-IP account limiter, the
// per-e-mail bucket, and only then the known-e-mail check. A known e-mail gets a
// sign-in link and the answer sign_in_first; Stripe is never opened. No session
// is ever created here, and the e-mail is never logged.

import { checkWriteRateLimit } from "../abuse/rate-limit";
import { sendCheckoutSignInLink } from "../auth/checkout-sign-in";
import { cfConnectingIp } from "../consent/ip";
import { asCheckout } from "../db/identity";
import { log } from "../logger";
import { createServerSupabaseClient, authSetCookieHeader, type AuthSetCookie } from "../supabase/server";
import { verifyTurnstile } from "../turnstile";
import { ACCOUNT_NOTICE_VERSION, accountCreateAvailable, guestAccountsOn } from "./account-notice";

export type AccountBlock = {
  choice: "guest" | "create";
  consent: boolean;
  turnstile_token?: string;
  idempotency_key?: string;
  return_to?: string;
};

export type AccountRecord = { choice: "guest" | "create"; textVersion: string };

export type AccountDecision =
  | { kind: "none" }
  | { kind: "refuse"; code: "account_consent_required" | "account_create_unavailable" }
  | { kind: "check"; record: AccountRecord };

/** Pure decision. A guest block with the switch off is ignored (D-09). */
export function decideAccount(input: {
  signedIn: boolean;
  account: AccountBlock | undefined;
  guestOn: boolean;
  createAvailable: boolean;
}): AccountDecision {
  const { account } = input;
  if (input.signedIn || !account) return { kind: "none" };
  if (account.choice === "guest") {
    if (!input.guestOn) return { kind: "none" };
    return { kind: "check", record: { choice: "guest", textVersion: ACCOUNT_NOTICE_VERSION } };
  }
  if (!input.createAvailable) return { kind: "refuse", code: "account_create_unavailable" };
  if (account.consent !== true) return { kind: "refuse", code: "account_consent_required" };
  return { kind: "check", record: { choice: "create", textVersion: ACCOUNT_NOTICE_VERSION } };
}

export type AccountRefusalCode =
  | "account_consent_required"
  | "account_create_unavailable"
  | "account_check_failed"
  | "rate_limited"
  | "sign_in_first";

export type AccountGateResult =
  | { proceed: true; record: AccountRecord | null }
  | { proceed: false; status: number; code: AccountRefusalCode };

export type AccountGateDeps = {
  verifyTurnstile: (token: string, idempotencyKey: string) => Promise<boolean>;
  ipLimit: () => Promise<boolean>;
  emailLimit: (email: string) => Promise<boolean>;
  hasAccount: (email: string) => Promise<boolean>;
  sendLink: (args: { email: string; returnTo: unknown }) => Promise<void>;
};

export async function runAccountGate(
  input: { decision: AccountDecision; email: string; account: AccountBlock | undefined },
  deps: AccountGateDeps,
): Promise<AccountGateResult> {
  const { decision } = input;
  if (decision.kind === "none") return { proceed: true, record: null };
  if (decision.kind === "refuse") return { proceed: false, status: 400, code: decision.code };

  const email = input.email.trim();
  const token = input.account?.turnstile_token ?? "";
  const key = input.account?.idempotency_key ?? "";
  if (!(await deps.verifyTurnstile(token, key))) {
    return { proceed: false, status: 403, code: "account_check_failed" };
  }
  if (!(await deps.ipLimit())) return { proceed: false, status: 429, code: "rate_limited" };
  if (!(await deps.emailLimit(email))) return { proceed: false, status: 429, code: "rate_limited" };

  let known: boolean;
  try {
    known = await deps.hasAccount(email);
  } catch {
    // Fail closed: no Stripe session on a check that could not be made.
    return { proceed: false, status: 503, code: "account_check_failed" };
  }
  if (known) {
    try {
      await deps.sendLink({ email, returnTo: input.account?.return_to });
    } catch {
      // The link failing does not change the answer: sign in first, no Stripe.
    }
    return { proceed: false, status: 200, code: "sign_in_first" };
  }
  return { proceed: true, record: decision.record };
}

/** The real deps. The PKCE verifier cookies the Supabase client sets are collected in `setCookies`. */
export function accountGateDeps(
  env: CloudflareEnv,
  request: Request,
  startedAt: number,
  locale: string,
  setCookies: AuthSetCookie[],
): AccountGateDeps {
  const ip = cfConnectingIp(request.headers) ?? "unknown";
  const ctx = { requestId: crypto.randomUUID(), route: "/api/checkout/intent", locale };
  const bindings = env as unknown as Record<string, string | undefined>;
  const host = new URL(request.url);
  return {
    verifyTurnstile: async (token, idempotencyKey) => {
      const out = await verifyTurnstile(
        env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
        token,
        {
          action: "account",
          idempotencyKey,
          allowedHostnames:
            bindings.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ?? process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES,
          remoteip: request.headers.get("cf-connecting-ip") ?? undefined,
        },
      );
      return out.ok;
    },
    ipLimit: async () =>
      (await checkWriteRateLimit({ limiter: env.QUOTE_RATE_LIMITER, kind: "account", ip })).ok,
    emailLimit: async (email) => {
      if (!env.AUTH_RATE_LIMITER) {
        log("error", "checkout_account", ctx, { reason: "account-limiter-missing" });
        return false;
      }
      try {
        const out = await env.AUTH_RATE_LIMITER.limit({ key: `auth-account:${email.toLowerCase()}` });
        return out.success === true;
      } catch {
        log("warn", "checkout_account", ctx, { reason: "account-limiter-throw" });
        return false;
      }
    },
    hasAccount: async (email) => {
      const rows = await asCheckout(env, null, (sql) =>
        sql<{ known: boolean | null }[]>`select public.checkout_email_has_account(${email}) as known`,
      );
      return rows[0]?.known === true;
    },
    sendLink: async ({ email, returnTo }) => {
      const supabase = await createServerSupabaseClient(request, { cookies: setCookies });
      const out = await sendCheckoutSignInLink(supabase, {
        email,
        locale,
        origin: `${host.protocol}//${host.host}`,
        returnTo,
        home: `/${locale}`,
        startedAt,
      });
      if (out.reason) log("error", "checkout_account", ctx, { reason: out.reason, action: "sign-in-link" });
    },
  };
}

function refusalResponse(code: AccountRefusalCode, status: number, cookies: readonly string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "private, no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify({ ok: false, code }), { status, headers });
}

/** Only the PKCE verifier may ride on a PAY answer; never a session token (checker rec. 2). */
function verifierCookieHeaders(cookies: readonly AuthSetCookie[]): string[] {
  return cookies.filter((c) => /code-verifier$/.test(c.name)).map(authSetCookieHeader);
}

export type AccountGateOutcome =
  | { response: Response }
  | { record: AccountRecord | null };

/**
 * Route entry point: decide, run the gate, and give back either the answer to
 * send now (before any Stripe call) or the record to write once the booking exists.
 */
export async function gateAccountForRequest(args: {
  env: CloudflareEnv;
  request: Request;
  startedAt: number;
  account: AccountBlock | undefined;
  email: string;
  locale: string;
  signedIn: boolean;
}): Promise<AccountGateOutcome> {
  const { env, account } = args;
  const decision = decideAccount({
    signedIn: args.signedIn,
    account,
    // A switch read only matters for a guest block.
    guestOn: account?.choice === "guest" && !args.signedIn ? await guestAccountsOn(env) : false,
    createAvailable: accountCreateAvailable(env),
  });
  const setCookies: AuthSetCookie[] = [];
  const result = await runAccountGate(
    { decision, email: args.email, account },
    accountGateDeps(env, args.request, args.startedAt, args.locale, setCookies),
  );
  if (result.proceed) return { record: result.record };
  const cookies = result.code === "sign_in_first" ? verifierCookieHeaders(setCookies) : [];
  return { response: refusalResponse(result.code, result.status, cookies) };
}
