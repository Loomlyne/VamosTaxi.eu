// apps/web/lib/ops/phone-booking.ts
//
// 08-06: staff resend of the existing unpaid Checkout Session. Same session
// unless it is no longer payable. Never mint a new Stripe session here. Public
// pay URL is vamostaxi.site — never dashboard.

import { sendPayLink } from "@vamos/emails/confirmation";
import type { PayLinkVehicle } from "@vamos/emails/confirmation";
import { asCheckout, asSystem } from "../db/identity";
import { mintManageToken } from "../checkout/manage-token";
import { confirmationRecipients } from "../checkout/pay-link";
import { setPayLink } from "../checkout/set-pay-link";
import { retrieveCheckoutSession, sessionIsPayable, stripeFromEnv, stripePublishableKey } from "../checkout/stripe";
import {
  clientSecretHex,
  emailLocale,
  payLinkVehicleSlug,
  publicPayUrl,
} from "./phone-booking-map";

export const dynamic = "force-dynamic";

export {
  PUBLIC_SITE_ORIGIN,
  clientSecretHex,
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
  clientSecretHex: string;
  publishableKey: string;
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
};

async function resolveBookingId(
  sql: Parameters<Parameters<typeof asSystem>[1]>[0],
  key: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id
      from public.bookings
     where erased_at is null
       and (id::text = ${key} or reference = ${key})
     limit 1
  `;
  return rows[0]?.id ?? null;
}

export async function staffPayLink(
  env: CloudflareEnv,
  bookingKey: string,
  sendEmail: boolean,
): Promise<StaffPayLinkResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  const loaded = await asSystem(env, async (sql): Promise<LoadedUnpaid | StaffPayLinkFail> => {
    const bookingId = await resolveBookingId(sql, key);
    if (!bookingId) return { ok: false, code: "not-found" };
    const rows = await sql<
      {
        id: string;
        reference: string;
        status: string;
        contact_name: string;
        contact_email: string | null;
        contact_phone: string | null;
        locale: string | null;
        company_name: string | null;
        company_address: string | null;
        company_vat: string | null;
        billing_kind: string | null;
        payer_email: string | null;
        pickup_text: string | null;
        dropoff_text: string | null;
        scheduled_local: string | null;
        flight_no: string | null;
        class_slug: string | null;
        pax: number | null;
        bags: number | null;
        charged_rappen: number | null;
        captured_at: string | Date | null;
        stripe_checkout_session_id: string | null;
      }[]
    >`
      select
        b.id,
        b.reference,
        b.status::text as status,
        b.contact_name,
        b.contact_email::text as contact_email,
        b.contact_phone,
        b.locale,
        b.company_name,
        b.company_address,
        b.company_vat,
        b.billing_kind::text as billing_kind,
        b.payer_email::text as payer_email,
        l.pickup_text,
        l.dropoff_text,
        l.scheduled_local,
        l.flight_no,
        vc.slug as class_slug,
        l.pax,
        l.bags,
        p.charged_rappen,
        p.captured_at,
        p.stripe_checkout_session_id
      from public.bookings b
      left join lateral (
        select *
          from public.booking_legs leg
         where leg.booking_id = b.id
         order by leg.leg_seq
         limit 1
      ) l on true
      left join public.vehicle_classes vc on vc.id = l.vehicle_class_id
      left join lateral (
        select pay.charged_rappen, pay.captured_at, pay.stripe_checkout_session_id
          from public.booking_payments pay
         where pay.booking_id = b.id
         order by pay.created_at desc
         limit 1
      ) p on true
      where b.id = ${bookingId}::uuid
      limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, code: "not-found" };
    const frozen = ["cancelled", "refunded", "completed", "no-show", "no_show"].includes(row.status);
    if (frozen) return { ok: false, code: "frozen" };
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
    };
  });

  if (!loaded || ("ok" in loaded && loaded.ok === false)) {
    return loaded as StaffPayLinkFail;
  }

  const stripe = stripeFromEnv(env);
  const stored = await retrieveCheckoutSession(stripe, loaded.stripeCheckoutSessionId).catch(
    () => null,
  );
  if (!sessionIsPayable(stored, loaded.chargedRappen) || !stored.client_secret) {
    return { ok: false, code: "session-expired" };
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
    clientSecretHex: clientSecretHex(stored.client_secret),
    publishableKey: stripePublishableKey(env),
    sent,
  };
}
