// apps/web/app/api/checkout/pay-link/open/route.ts
//
// POST { token }. Payer page. No VAT in the URL. Ban #5 asCheckout.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { asCheckout } from "@/lib/db/identity";
import { refuse } from "@/lib/checkout/errors";
import { hashRawToken } from "@/lib/checkout/manage-token";
import { attachPayment } from "@/lib/checkout/attach-payment";
import {
  createCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import type { CheckoutLocale } from "@/lib/checkout/currency";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(8) }).strict();

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return refuse("invalid_request");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return refuse("invalid_request");

  let hash: Uint8Array;
  try {
    hash = await hashRawToken(parsed.data.token);
  } catch {
    return refuse("invalid_request");
  }
  if (hash.byteLength === 0) return refuse("invalid_request");

  const rows = await asCheckout(env, null, (sql) => sql`
    select * from public.checkout_pay_link_by_hash(${hash})
  `);
  const row = rows[0];
  if (!row) return refuse("payment_window_closed");

  const charged = row.charged_rappen == null ? null : Number(row.charged_rappen);
  if (charged == null || !Number.isFinite(charged) || charged <= 0) {
    return refuse("payment_window_closed");
  }

  const origin = new URL(request.url).origin;
  const locale = (String(row.locale) || "en") as CheckoutLocale;
  const reference = String(row.reference);
  const bookingId = String(row.booking_id);
  const expiresAt = row.snapshot_expires_at instanceof Date
    ? row.snapshot_expires_at
    : new Date(String(row.snapshot_expires_at));
  const payerEmail = String(row.payer_email ?? row.contact_email ?? "");

  const stripe = stripeFromEnv(env);
  const session = await createCheckoutSession(stripe, {
    chargedRappen: charged,
    bookingId,
    bookingReference: reference,
    customerEmail: payerEmail,
    locale,
    idempotencyKey: `paylink:${reference}:${Math.floor(expiresAt.getTime() / 1000)}`,
    expiresAt,
    returnUrl: `${origin}${locale === "en" ? "" : `/${locale}`}/checkout/payment`,
    productName: `Vamos Taxi ${reference}`,
  });

  const pi = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!pi || !session.client_secret) return refuse("invalid_request");

  try {
    await asCheckout(env, null, (sql) =>
      attachPayment(sql, {
        quoteId: String(row.quote_id),
        stripePaymentIntentId: pi,
        stripeCheckoutSessionId: session.id,
        chargedRappen: charged,
      }),
    );
  } catch (err) {
    const state = typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
    if (state === "23001" || state === "23505") return refuse("quote_already_booked");
    if (state === "23P01") return refuse("payment_window_closed");
    throw err;
  }

  return Response.json({
    reference,
    pickup: String(row.pickup_text ?? ""),
    dropoff: String(row.dropoff_text ?? ""),
    expires_at: expiresAt.toISOString(),
    client_secret: session.client_secret,
    publishable_key: stripePublishableKey(env),
    currency: "CHF",
    amount_rappen: charged,
  });
}
