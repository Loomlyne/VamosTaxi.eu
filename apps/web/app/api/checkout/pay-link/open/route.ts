// apps/web/app/api/checkout/pay-link/open/route.ts
//
// POST { token }. Reuse the unpaid Checkout Session. Never mint a second
// session that 23001s the payer. A dead or unpriced token never reaches Stripe.
// Ban #5 asCheckout.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { asCheckout } from "@/lib/db/identity";
import { refuse } from "@/lib/checkout/errors";
import { hashRawToken } from "@/lib/checkout/manage-token";
import { attachPayment } from "@/lib/checkout/attach-payment";
import { loadOpenPayment } from "@/lib/checkout/load-open-payment";
import { payLinkPath } from "@/lib/checkout/pay-link";
import { stripeAccountIsLegacyUaeTest } from "@/lib/checkout/charge-gate";
import { stripeCheckoutReturnUrl } from "@/lib/checkout/return-url";
import { publicSiteOrigin, csrfForbidden } from "@/lib/security/origin";
import {
  checkoutPaymentIntentId,
  createCheckoutSession,
  retrieveCheckoutSession,
  sessionIsPayable,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import { CHARGE_CURRENCY, type CheckoutLocale } from "@/lib/checkout/currency";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(8) }).strict();

const PAY_JSON = { "cache-control": "private, no-store" };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function utf8Hex(value: string): string {
  return bytesToHex(new TextEncoder().encode(value));
}

function sqlState(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

function asLocale(value: string): CheckoutLocale {
  if (value === "de" || value === "fr" || value === "ar") return value;
  return "en";
}

function normalizePayToken(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

function isoInstant(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/** Payable-path stop. No code field — must not collapse into a charge-gate refusal. */
function legacyUaePrefixStop(): Response {
  return Response.json({ ok: false }, { status: 503, headers: PAY_JSON });
}

function openPaidJson(
  row: Record<string, unknown>,
  secret: string,
  charged: number,
  publishableKey: string,
): Record<string, unknown> {
  return {
    reference: String(row.reference),
    pickup: String(row.pickup_text ?? ""),
    dropoff: String(row.dropoff_text ?? ""),
    expires_at: isoInstant(row.snapshot_expires_at),
    lock_expires_at: isoInstant(row.token_expires_at),
    client_secret: secret,
    client_secret_hex: utf8Hex(secret),
    publishable_key: publishableKey,
    currency: CHARGE_CURRENCY.toUpperCase(),
    amount_rappen: charged,
    billing_email: String(row.payer_email ?? row.contact_email ?? ""),
    quote_id: String(row.quote_id),
  };
}

export async function POST(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const { env } = getCloudflareContext();
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return refuse("invalid_request");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return refuse("invalid_request");

  const token = normalizePayToken(parsed.data.token);
  let hash: Uint8Array;
  try {
    hash = await hashRawToken(token);
  } catch {
    return refuse("invalid_request");
  }
  if (hash.byteLength === 0) return refuse("invalid_request");
  const tokenHex = bytesToHex(hash);

  let row: Record<string, unknown>;
  try {
    const rows = await asCheckout(env, null, (sql) => sql`
      select * from public.checkout_pay_link_by_hash(decode(${tokenHex}, 'hex'))
    `);
    const found = rows[0];
    if (!found) return refuse("quote_expired");
    row = found as Record<string, unknown>;
  } catch (err) {
    const state = sqlState(err);
    if (state === "P0002" || state === "23P01") return refuse("quote_expired");
    throw err;
  }

  const testRows = await asCheckout(env, null, (sql) => sql<{ is_test: boolean | null }[]>`
    select public.checkout_booking_is_test_by_id(${String(row.booking_id)}::uuid) as is_test
  `);
  if (testRows[0]?.is_test === true) {
    return refuse("invalid_request");
  }

  const charged = row.charged_rappen == null ? null : Number(row.charged_rappen);
  if (charged == null || !Number.isFinite(charged) || charged <= 0) {
    return refuse("pricing_not_live");
  }

  if (stripeAccountIsLegacyUaeTest(env.STRIPE_PUBLISHABLE_KEY ?? "")) {
    return legacyUaePrefixStop();
  }

  const origin = publicSiteOrigin(new URL(request.url).host);
  const locale = asLocale(String(row.locale || "en"));
  const reference = String(row.reference);
  const bookingId = String(row.booking_id);
  const quoteId = String(row.quote_id);
  const expiresAt =
    row.snapshot_expires_at instanceof Date
      ? row.snapshot_expires_at
      : new Date(String(row.snapshot_expires_at));
  const payerEmail = String(row.payer_email ?? row.contact_email ?? "");
  const publishableKey = stripePublishableKey(env);
  const stripe = stripeFromEnv(env);

  const existing = await asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId));
  if (existing) {
    const stored = await retrieveCheckoutSession(stripe, existing.stripe_checkout_session_id).catch(
      () => null,
    );
    if (sessionIsPayable(stored, charged)) {
      const secret = stored.client_secret;
      if (!secret) return refuse("invalid_request");
      return Response.json(openPaidJson(row, secret, charged, publishableKey), { headers: PAY_JSON });
    }
  }

  const session = await createCheckoutSession(stripe, {
    chargedRappen: charged,
    bookingId,
    bookingReference: reference,
    customerEmail: payerEmail,
    locale,
    idempotencyKey: `paylink:${reference}:${Math.floor(expiresAt.getTime() / 1000)}`,
    expiresAt,
    returnUrl: stripeCheckoutReturnUrl(origin, locale),
    productName: `Vamos Taxi ${reference}`,
  });

  const pi = checkoutPaymentIntentId(session);
  if (!session.client_secret) return refuse("invalid_request");

  try {
    await asCheckout(env, null, (sql) =>
      attachPayment(sql, {
        quoteId,
        stripePaymentIntentId: pi,
        stripeCheckoutSessionId: session.id,
        chargedRappen: charged,
      }),
    );
  } catch (err) {
    const state = sqlState(err);
    if (state === "23001" || state === "23505") {
      const open = await asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId));
      if (open) {
        const stored = await retrieveCheckoutSession(stripe, open.stripe_checkout_session_id).catch(
          () => null,
        );
        if (sessionIsPayable(stored, charged)) {
          const secret = stored.client_secret;
          if (!secret) return refuse("invalid_request");
          return Response.json(openPaidJson(row, secret, charged, publishableKey), { headers: PAY_JSON });
        }
      }
      return refuse("quote_already_booked");
    }
    if (state === "23P01") return refuse("quote_expired");
    throw err;
  }

  return Response.json(openPaidJson(row, session.client_secret, charged, publishableKey), {
    headers: PAY_JSON,
  });
}
