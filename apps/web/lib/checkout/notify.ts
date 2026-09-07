// apps/web/lib/checkout/notify.ts
//
// D-19: the ledger half `@vamos/emails` omits. Claim, send, settle. This
// file never confirms a booking.

export const dynamic = "force-dynamic";

import {
  CONFIRMATION_TEMPLATE_VERSION,
  sendConfirmation,
  type BookingForEmail,
  type EmailLocale,
} from "@vamos/emails/confirmation";
import { asSystem } from "../db/identity";
import { mintManageToken } from "./manage-token";

type SettledBooking = {
  booking_id: string;
  reference: string;
  locale: string;
  contact_email: string;
};

/**
 * Stripe's webhook retries and the Queue backoff both resolve a transient
 * failure well inside this window. A shorter threshold races a delivery still
 * in flight and produces the double-send the ledger exists to prevent.
 * The research's illustrative "e.g. 5 minutes" is not a locked number.
 */
export const SWEEP_THRESHOLD = 10 * 60 * 1000;

const MANAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_ORIGIN = "https://vamostaxi.site";

function asEmailLocale(locale: string): EmailLocale {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

export async function deliverConfirmation(
  env: CloudflareEnv,
  settled: SettledBooking,
): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) return;

  const { raw, hash } = await mintManageToken();
  const expires = new Date(Date.now() + MANAGE_MAX_AGE_MS);
  const locale = asEmailLocale(settled.locale);
  const manageUrl = `${PUBLIC_ORIGIN}/${locale}/manage-booking?token=${raw}`;

  const booking = await asSystem(env, async (sql) => {
    await sql`
      select public.checkout_issue_manage_token(
        ${settled.booking_id}::uuid,
        ${hash},
        ${expires.toISOString()}::timestamptz
      )
    `;
    const rows = await sql`
      select * from public.checkout_booking_for_email(${settled.booking_id}::uuid)
    `;
    return rows[0];
  });

  if (!booking) return;

  const claimId = await asSystem(env, async (sql) => {
    const rows = await sql`
      select public.notification_claim(
        ${settled.booking_id}::uuid,
        ${"confirmation"},
        ${null}::uuid,
        ${"email"},
        ${locale},
        ${CONFIRMATION_TEMPLATE_VERSION}
      ) as id
    `;
    const id = rows[0]?.id;
    return id == null ? null : Number(id);
  });

  if (claimId == null) return;

  const scheduledLocal = String(booking.scheduled_local ?? "");
  const payload: BookingForEmail = {
    reference: String(booking.reference ?? settled.reference),
    contactName: String(booking.contact_name ?? ""),
    contactEmail: String(booking.contact_email ?? settled.contact_email),
    locale,
    displayCurrency: "CHF",
    totalRappen:
      booking.price_total_rappen == null ? null : Number(booking.price_total_rappen),
    manageUrl,
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText: String(booking.pickup_text ?? ""),
        dropoffText: String(booking.dropoff_text ?? ""),
        scheduledLocal,
        scheduledAt: scheduledLocal,
        flightNo: booking.flight_no ? String(booking.flight_no) : null,
        vehicleClassLabel: String(booking.vehicle_class_slug ?? "business"),
        pax: Number(booking.pax ?? 1),
        bags: Number(booking.bags ?? 0),
        estimatedDurationMinutes: null,
      },
    ],
  };

  const outcome = await sendConfirmation({ RESEND_API_KEY: key }, payload);

  const payer = await asSystem(env, async (sql) => {
    const rows = await sql`
      select payer_email from public.bookings where id = ${settled.booking_id}::uuid
    `;
    return rows[0]?.payer_email ? String(rows[0].payer_email) : "";
  });
  if (payer && payer.toLowerCase() !== payload.contactEmail.toLowerCase()) {
    await sendConfirmation({ RESEND_API_KEY: key }, { ...payload, contactEmail: payer });
  }
  await asSystem(env, async (sql) => {
    if (outcome.ok) {
      await sql`
        select public.notification_settle(
          ${claimId}::bigint,
          ${outcome.providerMessageId},
          ${null}::text
        )
      `;
    } else {
      await sql`
        select public.notification_settle(
          ${claimId}::bigint,
          ${null}::text,
          ${outcome.error}
        )
      `;
    }
  });
}

export async function sweepStuckNotifications(
  env: CloudflareEnv,
  olderThan = SWEEP_THRESHOLD,
  kinds: string[] = ["confirmation"],
): Promise<void> {
  const interval = `${Math.floor(olderThan / 1000)} seconds`;
  const stuck = await asSystem(env, async (sql) => {
    return sql`
      select * from public.notification_sweep(${interval}::interval, ${kinds}::text[])
    `;
  });

  for (const row of stuck) {
    await deliverConfirmation(env, {
      booking_id: String(row.booking_id),
      reference: "",
      locale: String(row.locale ?? "en"),
      contact_email: "",
    });
  }
}
