// apps/web/lib/ops/phone-booking.ts
//
// 08-06 / G8 (D-48): staff pay-link and Take card. No card form of ours, no
// client secret. Send pay-link mints the token and e-mails the public
// /checkout/pay/<token> page (vamostaxi.site, never dashboard); the customer's
// open call makes the Stripe-hosted session. Take card returns the Stripe-hosted
// Checkout URL of that booking for the dashboard to open in a new tab.

import { sendPayLink } from "@vamos/emails/confirmation";
import type { PayLinkVehicle } from "@vamos/emails/confirmation";
import { asCheckout } from "../db/identity";
import { loadPhoneBookingUnpaid } from "../db/system-reads";
import { mintManageToken } from "../checkout/manage-token";
import { confirmationRecipients } from "../checkout/pay-link";
import { setPayLink } from "../checkout/set-pay-link";
import { retrieveCheckoutSession, stripeFromEnv } from "../checkout/stripe";
import { openHostedPayLinkSession } from "../checkout/pay-link-hosted-session";
import { stripeCheckoutReturnUrl } from "../checkout/return-url";
import type { CheckoutLocale } from "../checkout/currency";
import {
  PUBLIC_SITE_ORIGIN,
  emailLocale,
  payLinkVehicleSlug,
  publicPayUrl,
} from "./phone-booking-map";

export const dynamic = "force-dynamic";

export {
  PUBLIC_SITE_ORIGIN,
  emailLocale,
  payLinkVehicleSlug,
  publicPayUrl,
} from "./phone-booking-map";

export type StaffPayLinkFail = { ok: false; code: string };
export type StaffPayLinkOk = {
  ok: true;
  reference: string;
  bookingId: string;
  payUrl: string;
  sent: boolean;
};
export type StaffPayLinkResult = StaffPayLinkOk | StaffPayLinkFail;

type LoadedUnpaid = {
  bookingId: string;
  reference: string;
  status: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  locale: string;
  companyName: string;
  companyAddress: string;
  companyVat: string;
  billingKind: "individual" | "company";
  payerEmail: string;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  flightNo: string | null;
  vehicleClass: PayLinkVehicle;
  pax: number;
  bags: number;
  chargedRappen: number;
  stripeCheckoutSessionId: string;
  quoteId: string;
  /** greatest(snapshot expiry, bookings.hold_until): the pay window, same rule as pay-link open. */
  snapshotExpiresAt: Date;
  snapshotTotalRappen: number;
};

async function loadUnpaid(
  env: CloudflareEnv,
  key: string,
): Promise<LoadedUnpaid | StaffPayLinkFail | null> {
  const row = await loadPhoneBookingUnpaid(env, key);
  if (!row) return { ok: false, code: "not-found" };
  const frozen = ["cancelled", "refunded", "completed", "no-show", "no_show"].includes(row.status);
  if (frozen) return { ok: false, code: "frozen" };
  if (row.is_test === true) return { ok: false, code: "is-test" };
  if (row.captured_at) return { ok: false, code: "already-paid" };
  const email = String(row.contact_email ?? "").trim();
  if (!email) return { ok: false, code: "no-email" };
  const sessionId = String(row.stripe_checkout_session_id ?? "").trim();
  if (!sessionId) return { ok: false, code: "no-session" };
  const billingKind = row.billing_kind === "company" ? "company" : "individual";
  return {
    bookingId: String(row.id),
    reference: String(row.reference),
    status: String(row.status),
    contactName: String(row.contact_name ?? ""),
    contactEmail: email,
    contactPhone: String(row.contact_phone ?? ""),
    locale: String(row.locale ?? "en"),
    companyName: String(row.company_name ?? ""),
    companyAddress: String(row.company_address ?? ""),
    companyVat: String(row.company_vat ?? ""),
    billingKind,
    payerEmail: String(row.payer_email ?? email),
    pickupText: String(row.pickup_text ?? ""),
    dropoffText: String(row.dropoff_text ?? ""),
    scheduledLocal: String(row.scheduled_local ?? ""),
    flightNo: row.flight_no ? String(row.flight_no) : null,
    vehicleClass: payLinkVehicleSlug(String(row.class_slug ?? "economy")),
    pax: Number(row.pax ?? 1) || 1,
    bags: Number(row.bags ?? 0) || 0,
    chargedRappen: Number(row.charged_rappen ?? 0) || 0,
    stripeCheckoutSessionId: sessionId,
    quoteId: String(row.quote_id ?? ""),
    snapshotExpiresAt: new Date(String(row.snap_expires_at ?? "")),
    snapshotTotalRappen: Number(row.snap_total_rappen ?? 0) || 0,
  };
}

export async function staffPayLink(
  env: CloudflareEnv,
  bookingKey: string,
  sendEmail: boolean,
): Promise<StaffPayLinkResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  const loaded = await loadUnpaid(env, key);
  if (!loaded) return { ok: false, code: "not-found" };
  if ("ok" in loaded) return loaded;

  const stripe = stripeFromEnv(env);
  const stored = await retrieveCheckoutSession(stripe, loaded.stripeCheckoutSessionId).catch(
    () => null,
  );
  // A stored hosted session that has expired (or cannot be read) does not stop the
  // link: /checkout/pay/<token> makes or reuses a fresh hosted session on open. Only a
  // complete session refuses, because money may be in flight.
  if (stored?.status === "complete" || stored?.payment_status === "paid") {
    return { ok: false, code: "already-paid" };
  }

  const token = await mintManageToken();
  const locale = emailLocale(loaded.locale);
  const payUrl = publicPayUrl(locale, token.raw);
  await asCheckout(env, null, (sql) =>
    setPayLink(sql, {
      bookingId: loaded.bookingId,
      billingKind: loaded.billingKind,
      companyName: loaded.companyName,
      companyAddress: loaded.companyAddress,
      companyVat: loaded.companyVat,
      payerEmail: loaded.payerEmail,
      tokenHash: token.hash,
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }),
  );

  let sent = false;
  if (sendEmail) {
    const outcome = await sendPayLink(
      { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
      {
        reference: loaded.reference,
        locale,
        payUrl,
        totalRappen: loaded.chargedRappen > 0 ? loaded.chargedRappen : null,
        pickupText: loaded.pickupText,
        dropoffText: loaded.dropoffText,
        scheduledLocal: loaded.scheduledLocal,
        flightNo: loaded.flightNo,
        vehicleClass: loaded.vehicleClass,
        pax: loaded.pax,
        bags: loaded.bags,
        extras: [],
        coupon: null,
        contactName: loaded.contactName,
        contactPhone: loaded.contactPhone,
        companyName: loaded.companyName,
        companyAddress: loaded.companyAddress,
        companyVat: loaded.companyVat,
      },
      confirmationRecipients(loaded.contactEmail, loaded.payerEmail),
    );
    if (!outcome.ok) return { ok: false, code: "email-failed" };
    sent = true;
  }

  return {
    ok: true,
    reference: loaded.reference,
    bookingId: loaded.bookingId,
    payUrl,
    sent,
  };
}

export type StaffTakeCardOk = {
  ok: true;
  reference: string;
  bookingId: string;
  /** The Stripe-hosted Checkout URL. The dashboard opens it in a new tab. */
  url: string;
};

/**
 * Take card (D-48): the Stripe-hosted page for this unpaid booking. Reuses the
 * open hosted session when it is still payable, else creates one through the
 * same builder the customer's pay-link uses. `dashboardOrigin` is the staff
 * host the request came from; Back on the Stripe page returns to the booking.
 */
export async function staffTakeCard(
  env: CloudflareEnv,
  bookingKey: string,
  dashboardOrigin: string,
): Promise<StaffTakeCardOk | StaffPayLinkFail> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  const loaded = await loadUnpaid(env, key);
  if (!loaded) return { ok: false, code: "not-found" };
  if ("ok" in loaded) return loaded;
  const charged = loaded.snapshotTotalRappen;
  if (!loaded.quoteId || !Number.isFinite(loaded.snapshotExpiresAt.getTime()) || charged <= 0) {
    return { ok: false, code: "no-session" };
  }
  if (loaded.snapshotExpiresAt.getTime() <= Date.now()) return { ok: false, code: "session-expired" };

  const locale = emailLocale(loaded.locale) as CheckoutLocale;
  const opened = await openHostedPayLinkSession(env, {
    bookingId: loaded.bookingId,
    quoteId: loaded.quoteId,
    reference: loaded.reference,
    payerEmail: loaded.payerEmail,
    locale,
    charged,
    expiresAt: loaded.snapshotExpiresAt,
    successUrl: stripeCheckoutReturnUrl(PUBLIC_SITE_ORIGIN, locale),
    cancelUrl: `${dashboardOrigin.replace(/\/$/, "")}/bookings/${encodeURIComponent(loaded.reference)}`,
  });
  if (!opened.ok) {
    const body = (await opened.response.json().catch(() => ({}))) as { code?: string };
    return { ok: false, code: body.code === "quote_already_booked" ? "already-paid" : "session-expired" };
  }
  return { ok: true, reference: loaded.reference, bookingId: loaded.bookingId, url: opened.session.url };
}
