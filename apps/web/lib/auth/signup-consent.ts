// apps/web/lib/auth/signup-consent.ts
//
// Sign-up consent is written when the address is confirmed, not at sign-up: before the
// confirmation link is followed there is no session, so the consent table (customer_id comes from the
// verified JWT inside record_consent) cannot be written. The sign-up call leaves
// user_metadata.signup_consent = "pending"; the callback calls this after a good exchange.
//
// Idempotent without reading the consent table (customers have no SELECT on it): after the row is
// written the metadata value becomes the policy version, so a second callback finds nothing pending.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { recordConsent, type ConsentLocale, type ConsentMethod } from "@/lib/consent/bind";
import { readConsentSubject, mintConsentSubject } from "@/lib/consent/cookie";
import { cfConnectingIp, truncateClientIp } from "@/lib/consent/ip";
import { CONSENT_POLICY_VERSION } from "@/lib/consent/policy";
import { asCustomer } from "@/lib/db/identity";
import { log } from "@/lib/logger";
import { AUTH_LOCALE_METADATA_KEY, SIGNUP_CONSENT_METADATA_KEY } from "@/lib/supabase/constants";

const CONSENT_LOCALES = new Set<ConsentLocale>(["en", "de", "fr", "ar"]);

type ConsentAuthClient = {
  auth: {
    getUser(): Promise<{
      data: {
        user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null;
      };
    }>;
    updateUser(args: { data: Record<string, string> }): Promise<{ error: unknown }>;
  };
};

/** Never throws: a consent failure must not break the sign-in the person just completed. */
export async function recordSignupConsentOnConfirm(input: {
  request: Request;
  supabase: ConsentAuthClient;
  fallbackLocale: string;
  ctx: { requestId: string; route: string; locale: string | null };
}): Promise<"recorded" | "skipped" | "failed"> {
  const { request, supabase, ctx } = input;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user?.id) return "skipped";
    const meta = user.user_metadata ?? {};
    if (meta[SIGNUP_CONSENT_METADATA_KEY] !== "pending") return "skipped";

    const stored = meta[AUTH_LOCALE_METADATA_KEY];
    const wanted = typeof stored === "string" ? stored : input.fallbackLocale;
    const locale: ConsentLocale = CONSENT_LOCALES.has(wanted as ConsentLocale)
      ? (wanted as ConsentLocale)
      : "en";
    const existing = readConsentSubject(request.headers.get("cookie"));
    const method: ConsentMethod = existing ? "settings_change" : "reject_all";
    const subject = existing ?? mintConsentSubject();

    const { env } = getCloudflareContext();
    await asCustomer(
      env,
      { sub: user.id, role: "authenticated", ...(user.email ? { email: user.email } : {}) },
      async (tx) => {
        await recordConsent(tx, {
          subject,
          method,
          locale,
          userAgent: request.headers.get("user-agent"),
          ipTruncated: truncateClientIp(cfConnectingIp(request.headers)),
        });
      },
    );

    const { error } = await supabase.auth.updateUser({
      data: { [SIGNUP_CONSENT_METADATA_KEY]: CONSENT_POLICY_VERSION },
    });
    if (error) log("warn", "auth", ctx, { reason: "consent-flag-not-cleared" });
    return "recorded";
  } catch {
    log("error", "auth", ctx, { reason: "consent-write" });
    return "failed";
  }
}
