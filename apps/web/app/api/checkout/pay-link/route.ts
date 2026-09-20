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
import { loadOpenPayment } from "@/lib/checkout/load-open-payment";
import { mintManageToken } from "@/lib/checkout/manage-token";
import { setPayLink } from "@/lib/checkout/set-pay-link";
import { lookupVehicleClassId, snapshotPolicyFromSettings } from "@/lib/checkout/lock-to-rpc";
import { confirmationRecipients, payLinkEmailFromLock, payLinkPath } from "@/lib/checkout/pay-link";
import { verifyLock } from "@/lib/quote/lock";
import {
  createCheckoutSession,
  expireCheckoutSession,
  retrieveCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import { loadLaunchFlags, loadRateBook, loadSettingsVersion } from "@/lib/db/quote";
import { catalogFromSurcharges } from "@/lib/checkout/extras-catalog";
import { policyHours } from "@/lib/checkout/policy-settings";
import { mapRateBook } from "@/lib/pricing/rateBook";
import type { IntentRecompute } from "@/lib/quote/intent";
import { publicSiteOrigin, csrfForbidden } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

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

  const parsed = checkoutPayLinkSchema.safeParse(json);
  if (!parsed.success) return refuse("invalid_request");
  const body = parsed.data;

  const stripe = stripeFromEnv(env);
  const origin = publicSiteOrigin(new URL(request.url).host);
  const current = env.QUOTE_LOCK_SECRET || "";
  const previous = env.QUOTE_LOCK_SECRET_PREVIOUS;

  const { postgresNowIso, vehicleClassId } = await asQuote(env, async (sql) => {
    const rows = await sql`select now() as now`;
    const value = rows[0]?.now;
    return {
      postgresNowIso: value instanceof Date ? value.toISOString() : String(value),
      vehicleClassId: await lookupVehicleClassId(sql, body.vehicle_class),
    };
  });
  if (!vehicleClassId) {
    return refuse("invalid_request");
  }

  const settingsDoc = await loadSettingsVersion(env, postgresNowIso);
  const policy = policyHours(settingsDoc);
  if (policy.checkoutWindowMinutes == null) {
    return refuse("payment_window_closed");
  }
  const snapshotPolicy = snapshotPolicyFromSettings(settingsDoc);
  if (!snapshotPolicy) {
    return refuse("invalid_request");
  }

  let extrasCatalog: ReturnType<typeof catalogFromSurcharges> = [];
  let liveRateVersionId: number | null = null;
  try {
    const liveBook = mapRateBook(await loadRateBook(env, { preferDraft: false }));
    extrasCatalog = catalogFromSurcharges(liveBook.surcharges);
    const live = liveBook.rate_version;
    liveRateVersionId =
      live && live.status === "live" && typeof live.id === "number" ? live.id : null;
  } catch {
    extrasCatalog = [];
  }

  const intentRes = await runCheckoutIntent(body, {
    lockSecrets: previous ? { current, previous } : { current },
    workerNowIso: new Date().toISOString(),
    postgresNowIso,
    reprice: (payload) => ({
      pricing_live: true,
      engine_version: payload.engine_version,
      live_rate_version_id: liveRateVersionId,
      classes: payload.class_totals.map((row) => ({
        slug: row.slug as IntentRecompute["classes"][number]["slug"],
        total_rappen: row.total_rappen,
        eligible: row.total_rappen != null,
      })),
    }),
    mintManageToken,
    manageLinkMaxAgeSeconds: 30 * 24 * 60 * 60,
    createCheckoutSession: (input) => createCheckoutSession(stripe, input),
    expireCheckoutSession: (id) => expireCheckoutSession(stripe, id).then(() => undefined),
    retrieveCheckoutSession: (id) => retrieveCheckoutSession(stripe, id),
    createBooking: (args) => asCheckout(env, null, (sql) => createBooking(sql, args)),
    attachPayment: (args) => asCheckout(env, null, (sql) => attachPayment(sql, args)),
    loadOpenPayment: (quoteId) => asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId)),
    publishableKey: stripePublishableKey(env),
    returnUrl: `${origin}${body.locale === "en" ? "" : `/${body.locale}`}/checkout/payment`,
    checkoutWindowMinutes: policy.checkoutWindowMinutes,
    actorCustomerId: null,
    vehicleClassId,
    snapshotPolicy,
    extrasCatalog,
    loadLaunchFlags: () => loadLaunchFlags(env),
    loadQuotePayGate: async (quoteId) => {
      const rows = await asCheckout(env, null, (sql) => sql<{ is_test: boolean | null }[]>`
        select is_test from public.bookings
         where quote_id = ${quoteId}::uuid
         limit 1
      `);
      const row = rows[0];
      if (!row) return null;
      return { is_test: row.is_test === true };
    },
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
  const verified = await verifyLock(
    previous ? { current, previous } : { current },
    body.lock,
    "0001-01-01T00:00:00.000Z",
  );
  const lockPayload = verified.ok
    ? verified.payload
    : "payload" in verified
      ? verified.payload
      : null;
  const sent = await sendPayLink(
    { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
    payLinkEmailFromLock({
      reference: payload.reference,
      locale: body.locale,
      payUrl,
      totalRappen: payload.amount_rappen,
      payload: lockPayload,
      vehicleClass: body.vehicle_class,
      extras: body.extras,
      coupon: body.coupon ?? null,
      contactName: body.contact.name,
      contactPhone: body.contact.phone,
      companyName: body.company_name ?? "",
      companyAddress: body.company_address ?? "",
      companyVat: body.company_vat ?? "",
    }),
    to,
  );
  if (!sent.ok) {
    return Response.json({ error: "email_failed", code: "invalid_request" }, { status: 502, headers: { "cache-control": "private, no-store" } });
  }

  return Response.json(
    {
      ok: true,
      reference: payload.reference,
      pay_url: payUrl,
      expires_at: payload.expires_at,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
