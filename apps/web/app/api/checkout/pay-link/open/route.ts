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
import { payLinkPath } from "@/lib/checkout/pay-link";
import { payLinkSessionId, resolvePayLinkRefusal } from "@/lib/checkout/pay-link-state";
import { stripeAccountIsLegacyUaeTest } from "@/lib/checkout/charge-gate";
import { stripeCheckoutReturnUrl } from "@/lib/checkout/return-url";
import { publicSiteOrigin, csrfForbidden } from "@/lib/security/origin";
import { openHostedPayLinkSession } from "@/lib/checkout/pay-link-hosted-session";
import { CHARGE_CURRENCY, type CheckoutLocale } from "@/lib/checkout/currency";

export const dynamic = "force-dynamic";

// session_id: the recipient's own Checkout Session from the Stripe return
// (26.1-16). Format-checked by payLinkSessionId; anything else is ignored.
const bodySchema = z.object({ token: z.string().min(8), session_id: z.unknown().optional() }).strict();

const PAY_JSON = { "cache-control": "private, no-store" };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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

/** Hosted answer: the Stripe-hosted page url, never a client secret (D-46). */
function openHostedJson(
  row: Record<string, unknown>,
  session: { id: string; url: string },
  charged: number,
): Record<string, unknown> {
  return {
    ok: true,
    hosted_page: true,
    url: session.url,
    session_id: session.id,
    reference: String(row.reference),
    pickup: String(row.pickup_text ?? ""),
    dropoff: String(row.dropoff_text ?? ""),
    expires_at: isoInstant(row.snapshot_expires_at),
    lock_expires_at: isoInstant(row.token_expires_at),
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
  const sessionId = payLinkSessionId(parsed.data.session_id);

  // D-20/D-21/D-22: a link that is no longer payable says why — paid,
  // refunded as a duplicate, or expired. Never reaches Stripe.
  const refusePayLink = () =>
    resolvePayLinkRefusal(
      {
        readState: async (sid) => {
          const rows = await asCheckout(env, null, (sql) => sql<{ state: string; reference: string | null }[]>`
            select state, reference
              from public.checkout_pay_link_state(decode(${tokenHex}, 'hex'), ${sid})
          `);
          return rows[0] ?? null;
        },
      },
      sessionId,
    );

  let row: Record<string, unknown>;
  try {
    const rows = await asCheckout(env, null, (sql) => sql`
      select * from public.checkout_pay_link_by_hash(decode(${tokenHex}, 'hex'))
    `);
    const found = rows[0];
    if (!found) return refusePayLink();
    row = found as Record<string, unknown>;
  } catch (err) {
    const state = sqlState(err);
    if (state === "P0002") return refusePayLink();
    if (state === "23P01") return refuse("quote_expired");
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
  const opened = await openHostedPayLinkSession(env, {
    bookingId,
    quoteId,
    reference,
    payerEmail,
    locale,
    charged,
    expiresAt,
    // D-46: pays on Stripe's page; Back returns to this same pay-link page.
    successUrl: stripeCheckoutReturnUrl(origin, locale),
    cancelUrl: `${origin.replace(/\/$/, "")}${payLinkPath(locale, token)}`,
  });
  if (!opened.ok) return opened.response;
  return Response.json(openHostedJson(row, opened.session, charged), { headers: PAY_JSON });
}
