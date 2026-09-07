// apps/web/app/api/checkout/pay-link/route.ts
//
// POST /api/checkout/pay-link. Mints unpaid VT-, emails passenger + payer.
// 24h clock does not restart on resend. Charge gate unchanged.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendPayLink } from "@vamos/emails/confirmation";
import { asCheckout, asQuote } from "@/lib/db/identity";
import { checkoutPayLinkSchema } from "@/lib/checkout/intent-schema";
import { refuse } from "@/lib/checkout/errors";
import { runCheckoutIntent } from "@/lib/checkout/intent";
import { createBooking } from "@/lib/checkout/create-booking";
import { attachPayment } from "@/lib/checkout/attach-payment";
import { mintManageToken } from "@/lib/checkout/manage-token";
import { setPayLink } from "@/lib/checkout/set-pay-link";
import { confirmationRecipients, payLinkPath } from "@/lib/checkout/pay-link";
import {
  createCheckoutSession,
  expireCheckoutSession,
  retrieveCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import { verifyTurnstile } from "@/lib/turnstile";
import { loadSettingsVersion } from "@/lib/db/quote";
import { policyHours } from "@/lib/checkout/policy-settings";
import type { IntentRecompute } from "@/lib/quote/intent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { env } = getCloudflareContext();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return refuse("invalid_request");
  }

  const parsed = checkoutPayLinkSchema.safeParse(json);
  if (!parsed.success) return refuse("invalid_request");
  const body = parsed.data;

  const stripe = stripeFromEnv(env);
  const origin = new URL(request.url).origin;
  const current = env.QUOTE_LOCK_SECRET || "";
  const previous = env.QUOTE_LOCK_SECRET_PREVIOUS;
  const allowedHostnames =
    (env as CloudflareEnv & { CONTACT_TURNSTILE_ALLOWED_HOSTNAMES?: string })
      .CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ?? process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES;

  const postgresNowIso = await asQuote(env, async (sql) => {
    const rows = await sql`select now() as now`;
    const value = rows[0]?.now;
    return value instanceof Date ? value.toISOString() : String(value);
  });

  const policy = policyHours(await loadSettingsVersion(env, postgresNowIso));
  if (policy.checkoutWindowMinutes == null) {
    return refuse("payment_window_closed");
  }

  const intentRes = await runCheckoutIntent(body, {
    lockSecrets: previous ? { current, previous } : { current },
    workerNowIso: new Date().toISOString(),
    postgresNowIso,
    reprice: (payload) => ({
      pricing_live: true,
      engine_version: payload.engine_version,
      classes: payload.class_totals.map((row) => ({
        slug: row.slug as IntentRecompute["classes"][number]["slug"],
        total_rappen: row.total_rappen,
        eligible: row.total_rappen != null,
      })),
    }),
    verifyTurnstile: async (token) => {
      if (!token) return true;
      const result = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, {
        action: "checkout",
        idempotencyKey: body.idempotency_key,
        allowedHostnames,
      });
      if (!result.ok && result.codes.some((c) => c === "invalid-hostname-config" || c === "missing-secret")) {
        return true;
      }
      return result.ok;
    },
    mintManageToken,
    manageLinkMaxAgeSeconds: 30 * 24 * 60 * 60,
    createCheckoutSession: (input) => createCheckoutSession(stripe, input),
    expireCheckoutSession: (id) => expireCheckoutSession(stripe, id).then(() => undefined),
    retrieveCheckoutSession: (id) => retrieveCheckoutSession(stripe, id),
    createBooking: (args) => asCheckout(env, null, (sql) => createBooking(sql, args)),
    attachPayment: (args) => asCheckout(env, null, (sql) => attachPayment(sql, args)),
    publishableKey: stripePublishableKey(env),
    returnUrl: `${origin}${body.locale === "en" ? "" : `/${body.locale}`}/checkout/payment`,
    checkoutWindowMinutes: policy.checkoutWindowMinutes,
    actorCustomerId: null,
  });

  if (!intentRes.ok) return intentRes;
  const payload = (await intentRes.json()) as {
    reference: string;
    booking_id: string;
    amount_rappen: number | null;
    expires_at: string;
  };

  const payToken = await mintManageToken();
  await asCheckout(env, null, (sql) =>
    setPayLink(sql, {
      bookingId: payload.booking_id,
      billingKind: body.billing_kind,
      companyName: body.company_name ?? "",
      companyAddress: body.company_address ?? "",
      companyVat: body.company_vat ?? "",
      payerEmail: body.payer_email,
      tokenHash: payToken.hash,
      tokenExpiresAt: new Date(payload.expires_at),
    }),
  );

  const payUrl = `${origin}${payLinkPath(body.locale, payToken.raw)}`;
  const to = confirmationRecipients(body.contact.email, body.payer_email);
  const sent = await sendPayLink(
    { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
    {
      reference: payload.reference,
      locale: body.locale,
      payUrl,
      totalRappen: payload.amount_rappen,
      pickupText: "",
      dropoffText: "",
    },
    to,
  );
  if (!sent.ok) {
    return Response.json({ error: "email_failed", code: "invalid_request" }, { status: 502 });
  }

  return Response.json({
    ok: true,
    reference: payload.reference,
    pay_url: payUrl,
    expires_at: payload.expires_at,
  });
}
