// apps/web/lib/checkout/provision-account.ts
//
// 26.5-05 (D-02, D-05): after a payment settles, turn the account request recorded at PAY into a
// real, unconfirmed account (no credential) and send ONE "finish your account" mail with a magic
// link. Runs in the queue consumer only. It writes no consent (the record was written at PAY, D-12)
// and reaches the service role only through checkoutAuthAdmin (D-14). It never throws and never
// logs an e-mail address, token or link.

export const dynamic = "force-dynamic";

import { renderAuthEmail } from "@vamos/emails";
import { Resend } from "resend";
import { routing } from "@/i18n/routing";
import { readCheckoutAccountRequest, readCheckoutAccountUserState } from "../db/system-reads";
import type { ScalarValue } from "../logger";
import { publicSiteOrigin } from "../security/origin";
import { checkoutAuthAdmin, type CheckoutAuthAdmin } from "../supabase/service-role";

export type ProvisionResult = "created" | "skipped" | "exists" | "limited" | "failed";

type Locale = (typeof routing.locales)[number];

export type ProvisionDeps = {
  readRequest: (bookingId: string) => Promise<{
    email: string;
    choice: "guest" | "create";
    full_name: string;
    locale: string;
  } | null>;
  readUserState: (email: string) => Promise<{ user_exists: boolean; confirmed: boolean; checkout_origin: boolean }>;
  /** true = allowed. Missing binding or a throw is a refusal (fail closed). */
  limit: (key: string) => Promise<boolean>;
  admin: () => CheckoutAuthAdmin | null;
  sendMail: (to: string, mail: { subject: string; html: string; text: string }) => Promise<void>;
  origin: string;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

const FROM_EMAIL = "noreply@vamostaxi.site";
const FROM_NAME = "Vamos Taxi";

function asLocale(value: string): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : "en";
}

/** Reads the request, creates the unconfirmed user, mails the finish link. Never throws. */
export async function provisionCheckoutAccount(
  row: { booking_id: string },
  deps: ProvisionDeps,
): Promise<ProvisionResult> {
  const bookingId = row.booking_id;
  try {
    const request = await deps.readRequest(bookingId);
    if (!request) return "skipped";

    const email = request.email.trim().toLowerCase();
    if (!(await deps.limit(`account-mail:${email}`))) {
      deps.emit("warn", "account_provision_limited", { bookingId });
      return "limited";
    }

    const admin = deps.admin();
    if (!admin) {
      deps.emit("error", "account_provision_failed", { bookingId, reason: "admin-unavailable" });
      return "failed";
    }

    const locale = asLocale(request.locale);
    const created = await admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: request.full_name,
        vamos_locale: locale,
        vamos_account_origin: `checkout-${request.choice}`,
      },
    });

    if (created.errorCode) {
      if (created.errorCode !== "email_exists") {
        deps.emit("error", "account_provision_failed", { bookingId, reason: "create-user" });
        return "failed";
      }
      const state = await deps.readUserState(email);
      // Only an unconfirmed user the checkout made gets the mail again (a failed earlier send).
      if (!(state.user_exists && !state.confirmed && state.checkout_origin)) return "exists";
    }

    const link = await admin.generateLink({ type: "magiclink", email });
    if (link.errorCode || !link.hashedToken) {
      deps.emit("error", "account_provision_failed", { bookingId, reason: "generate-link" });
      return "failed";
    }
    const verifyType = link.verificationType ?? "magiclink";
    const url =
      `${deps.origin}/api/auth/callback?token_hash=${encodeURIComponent(link.hashedToken)}` +
      `&type=${encodeURIComponent(verifyType)}&next=${encodeURIComponent(`/${locale}/account`)}`;

    const mail = renderAuthEmail("account_ready", locale, { code: "", link: url, name: request.full_name });
    await deps.sendMail(email, mail);
    return "created";
  } catch {
    deps.emit("error", "account_provision_failed", { bookingId, reason: "exception" });
    return "failed";
  }
}

async function sendBranded(
  env: CloudflareEnv,
  to: string,
  rendered: { subject: string; html: string; text: string },
): Promise<void> {
  if (env.EMAIL?.send) {
    await env.EMAIL.send({
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    return;
  }
  const key = env.RESEND_API_KEY;
  if (!key) throw new Error("no-sender");
  const { error } = await new Resend(key).emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (error) throw error;
}

/** Real dependencies for the queue consumer. */
export function provisionDeps(env: CloudflareEnv, emit: ProvisionDeps["emit"]): ProvisionDeps {
  return {
    readRequest: (bookingId) => readCheckoutAccountRequest(env, bookingId),
    readUserState: (email) => readCheckoutAccountUserState(env, email),
    limit: async (key) => {
      const limiter = env.AUTH_RATE_LIMITER;
      if (!limiter) {
        emit("warn", "account_mail_limiter_missing", {});
        return false;
      }
      try {
        return (await limiter.limit({ key })).success;
      } catch {
        return false;
      }
    },
    admin: () => checkoutAuthAdmin(env),
    sendMail: (to, mail) => sendBranded(env, to, mail),
    origin: publicSiteOrigin(null),
    emit,
  };
}
