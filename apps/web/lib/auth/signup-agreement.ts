// apps/web/lib/auth/signup-agreement.ts
//
// 27 D-03a: a sign-up is accepted only with the tick, and the tick is stored in
// account_agreement_records (surface "sign-up"), never in the cookie-consent table. Same moment as
// 26.5's checkout record: written at the ticked submit, before the account is requested.

import { ACCOUNT_NOTICE_VERSION } from "@/lib/checkout/account-notice";
import { cfConnectingIp, truncateClientIp } from "@/lib/consent/ip";
import { asSystem } from "@/lib/db/identity";
import type { ProfileRunResult } from "./run";

/** Answer for a sign-up posted without the tick. */
export const CONSENT_REQUIRED: ProfileRunResult = { ok: false, reason: "consent-required" };

/** Answer when the agreement record could not be stored; no account is requested. */
export const SIGNUP_UNAVAILABLE: ProfileRunResult = { ok: false, reason: "signup-unavailable" };

/**
 * True only when the body carries the boolean `true` for `consent`.
 * @param fields request body fields (client supplied)
 */
export function signupConsentGiven(fields: Record<string, unknown>): boolean {
  return fields.consent === true;
}

/**
 * Stores one sign-up agreement row as vamos_system through public.record_account_agreement.
 * Version, surface, choice and IP are set here, never taken from the client. Logs the SQLSTATE
 * only on failure, never the e-mail.
 * @param env Cloudflare bindings
 * @param input e-mail, request locale and the request headers (user agent, cf-connecting-ip)
 * @returns true when the row is stored, false when the write failed
 */
export async function recordSignupAgreement(
  env: CloudflareEnv,
  input: { email: string; locale: string; headers: Headers },
): Promise<boolean> {
  const userAgent = (input.headers.get("user-agent") ?? "").slice(0, 300) || null;
  const ipTruncated = truncateClientIp(cfConnectingIp(input.headers));
  try {
    await asSystem(env, async (sql) => {
      await sql`
        select public.record_account_agreement(
          'sign-up',
          null::uuid,
          ${input.email},
          'create',
          ${ACCOUNT_NOTICE_VERSION},
          ${input.locale},
          ${userAgent},
          ${ipTruncated}::inet
        )
      `;
    });
    return true;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : "no-sqlstate";
    console.error("signup_agreement_record_failed", code);
    return false;
  }
}
