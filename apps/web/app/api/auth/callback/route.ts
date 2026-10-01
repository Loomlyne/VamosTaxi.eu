// apps/web/app/api/auth/callback/route.ts
//
// Magic-link / OTP / recovery landing.
//   GET  ?code=          PKCE exchange (links already in inboxes), sets cookies, redirects.
//   GET  ?token_hash=    F12: signs nobody in. It sends the visitor to the confirm page.
//   POST                 F12: the confirm page's button. Same-origin only; verifyOtp, the signed-in
//                        address must equal the address sealed in the link, cookies copied by hand.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import { confirmPathFor } from "@/lib/auth/confirm-link";
import { finishTarget, mustFinish } from "@/lib/auth/finish-target";
import { decodeNextParam, validateAuthRedirectTarget } from "@/lib/auth/redirect-target";
import { openAddress, sealSecretFrom } from "@/lib/auth/sealed-address";
import { routing } from "@/i18n/routing";
import { getStaffClaims, staffDecisionOf, type StaffAuthClient } from "@/lib/ops/session";
import { csrfForbidden, isDashboardHost, trustedSiteOrigin } from "@/lib/security/origin";
import {
  authSetCookieHeader,
  createServerSupabaseClient,
  type AuthSetCookie,
} from "@/lib/supabase/server";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Link types the confirm button may spend. The staff invite is confirm-only and never reaches here. */
const OTP_TYPES = new Set<string>(["signup", "magiclink", "recovery", "email_change", "email"]);

/** Target validation lives in lib/auth/redirect-target.ts (PUBLIC_ROUTES + checkout returnTo). */

function isLocale(value: string): value is (typeof routing.locales)[number] {
  return (routing.locales as readonly string[]).includes(value);
}

function signInErrorPath(locale: string): string {
  const path = locale === routing.defaultLocale ? "/sign-in" : `/${locale}/sign-in`;
  return `${path}?error=1`;
}

function localeFromNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return routing.defaultLocale;
  const first = raw.split("/").filter(Boolean)[0];
  return first && isLocale(first) ? first : routing.defaultLocale;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  // `nextb` is base64url of the target (a checkout path with a query); the plain `next` is for simple paths.
  const next = decodeNextParam(url.searchParams.get("nextb")) ?? url.searchParams.get("next") ?? url.searchParams.get("redirect_to");
  const locale = localeFromNext(next);
  const origin = trustedSiteOrigin(url.host) ?? "https://vamostaxi.site";
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth/callback", locale };

  if (!code && tokenHash) {
    // F12: a token in a URL is never spent by a GET (scanners, look-alike links). The confirm page shows
    // whose link it is and only its button signs in. A link without `e` shows "expired" there.
    const confirm = new URL(confirmPathFor(url.host), origin);
    for (const key of ["token_hash", "type", "next", "nextb", "e"]) {
      const value = url.searchParams.get(key);
      if (value) confirm.searchParams.set(key, value);
    }
    return NextResponse.redirect(confirm, 302);
  }

  const setCookies: AuthSetCookie[] = [];
  // next/headers cookies().set does not attach to a hand-built redirect on the Worker:
  // every cookie the client wrote goes onto the response by hand.
  const redirectTo = (path: string): NextResponse => {
    const response = NextResponse.redirect(new URL(path, origin), 302);
    for (const cookie of setCookies) response.headers.append("Set-Cookie", authSetCookieHeader(cookie));
    return response;
  };
  const fail = (): NextResponse => redirectTo(signInErrorPath(locale));

  const supabase = await createServerSupabaseClient(request, { cookies: setCookies });
  let error: { message?: string; code?: string } | null = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    log("error", "auth-callback", ctx, { reason: "missing-token" });
    return fail();
  }

  if (error) {
    log("error", "auth-callback", ctx, { reason: error.code ?? "exchange-failed" });
    return fail();
  }

  const target = validateAuthRedirectTarget(next, locale);
  return redirectTo(target);
}

const NO_STORE = { "cache-control": "private, no-store" } as const;

function str(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

/** One Set-Cookie per name, the last write wins (a sign-out after a sign-in must stay a removal). */
function lastPerName(cookies: AuthSetCookie[]): AuthSetCookie[] {
  const byName = new Map<string, AuthSetCookie>();
  for (const cookie of cookies) byName.set(cookie.name, cookie);
  return [...byName.values()];
}

/** The confirm page's button: spends the token once, for the address sealed in the link. */
export async function POST(request: Request): Promise<Response> {
  const blocked = csrfForbidden(request, "auth");
  if (blocked) return blocked;
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth/callback", locale: null as string | null };

  const { env } = getCloudflareContext();
  if (!env.AUTH_RATE_LIMITER) {
    log("error", "auth-callback", ctx, { reason: "auth-limiter-missing" });
  } else {
    const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
    const limited = await checkWriteRateLimit({ limiter: env.AUTH_RATE_LIMITER, kind: "auth", ip });
    if (!limited.ok) return Response.json({ ok: false, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }

  const setCookies: AuthSetCookie[] = [];
  const answer = (status: number, body: Record<string, unknown>): Response => {
    const response = Response.json(body, { status, headers: NO_STORE });
    // next/headers cookies().set does not attach to a hand-built Response on the Worker.
    for (const cookie of lastPerName(setCookies)) response.headers.append("Set-Cookie", authSetCookieHeader(cookie));
    return response;
  };
  const expired = (): Response => answer(400, { ok: false, code: "expired" });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return expired();
  }
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const tokenHash = str(body.token_hash, 512);
  const type = str(body.type, 32);
  const sealed = str(body.e, 2000);
  if (!tokenHash || !type || !OTP_TYPES.has(type) || !sealed) return expired();

  const address = await openAddress(sealed, tokenHash, sealSecretFrom(env));
  if (!address) {
    log("warn", "auth-callback", ctx, { reason: "seal-refused" });
    return expired();
  }

  const nextRaw = decodeNextParam(str(body.nextb, 4000)) ?? str(body.next, 2000);
  const locale = localeFromNext(nextRaw);
  ctx.locale = locale;

  const supabase = await createServerSupabaseClient(request, { cookies: setCookies });

  // Already signed in as someone else: the screen said so, so this switches the account.
  const { data: current } = await supabase.auth.getUser();
  const currentEmail = current?.user?.email?.toLowerCase();
  // An e-mail change link is for the account's old or its new address: the signed-in holder keeps the session.
  if (type !== "email_change" && currentEmail && currentEmail !== address) await supabase.auth.signOut({ scope: "local" });

  const { data, error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
  // Secure e-mail change, first of two clicks: Supabase answers "link accepted, now confirm the other
  // address" with no user and no session. That is progress, not a failure; nothing is signed in yet.
  if (type === "email_change" && !error && !data?.user && !data?.session) {
    return answer(200, { ok: true, pending: true });
  }
  if (error || !data?.user) {
    log("error", "auth-callback", ctx, { reason: error?.code ?? "verify-failed" });
    return expired();
  }

  // The session that verifyOtp made must be for the address the screen showed. For an e-mail change the
  // address is the account's current e-mail or its pending new_email. When this press was the second click
  // the change is already done and the old address no longer appears on the account: the seal (bound to this
  // token_hash, made only by the hook) says the token was mailed to `address`, and Supabase just accepted it.
  const changeDone = type === "email_change" && !data.user.new_email;
  const verified = [data.user.email, type === "email_change" ? data.user.new_email : null]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());
  if (!verified.includes(address) && !changeDone) {
    log("error", "auth-callback", ctx, { reason: "address-mismatch" });
    await supabase.auth.signOut({ scope: "local" });
    return expired();
  }

  // Dashboard host: same refusal as password and code sign-in (api/auth/route.ts refuseNonStaff).
  // An account without an accepted staff role is signed straight back out; the session cookie
  // verifyOtp just made is overwritten by the sign-out's removal (last write per name wins).
  if (isDashboardHost(new URL(request.url).host)) {
    const staff = await getStaffClaims(supabase as unknown as StaffAuthClient);
    if (!staff || staffDecisionOf(staff) === "deny") {
      log("warn", "auth-callback", ctx, { reason: "not-staff" });
      await supabase.auth.signOut({ scope: "local" });
      return answer(403, { ok: false, code: "not-staff" });
    }
  }

  const target = validateAuthRedirectTarget(nextRaw, locale);
  // 27.1 (27 D-37): an account the sign-in link just made finishes first (name, optional phone, the tick).
  if (!isDashboardHost(new URL(request.url).host) && data.user.id && (await mustFinish(env, data.user.id, ctx))) {
    return answer(200, { ok: true, target: finishTarget(locale, target) });
  }
  return answer(200, { ok: true, target });
}
