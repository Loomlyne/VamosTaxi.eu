// apps/web/lib/ops/voucher.ts
//
// Staff resend of the confirmation voucher. Does not use the first-send
// claim row, so a second send is allowed. Never asStaff INSERT. Hyperdrive DIRECT only.

import { sendConfirmation, type BookingForEmail, type EmailLocale } from "@vamos/emails/confirmation";
import { asStaff, asSystem, type VamosClaims } from "@/lib/db/identity";
import { emailExtrasFromPolicy } from "@/lib/checkout/pay-link";
import { mintManageToken } from "@/lib/checkout/manage-token";
import { PUBLIC_SITE_ORIGIN } from "./phone-booking-map";
import { resolveStaffBookingId } from "./resolve-booking-id";

export type VoucherResult =
  | { ok: true; email: string }
  | { ok: false; code: "not-found" | "not-paid" | "no-email" | "email-failed" };

const MANAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function asEmailLocale(locale: string): EmailLocale {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

export async function resendVoucher(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<VoucherResult> {
  const bookingId = await resolveStaffBookingId(env, claims, id);
  if (!bookingId) return { ok: false, code: "not-found" };

  const paid = await asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: number }[]>`
      select 1 as id
        from public.booking_payments
       where booking_id = ${bookingId}::uuid
         and captured_at is not null
       limit 1
    `;
    return rows.length > 0;
  });
  if (!paid) return { ok: false, code: "not-paid" };

  return deliverBookingConfirmation(env, bookingId);
}

/**
 * The confirmation mail with a fresh manage link, built from the booking as it is now (class,
 * total, extras). System role only: every read is a SECURITY DEFINER function. 26.2 P1 sends it
 * again after a class change (D7); the staff resend above checks the payment first.
 */
export async function deliverBookingConfirmation(
  env: CloudflareEnv,
  bookingId: string,
): Promise<VoucherResult> {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, code: "email-failed" };

  const { raw, hash } = await mintManageToken();
  const expires = new Date(Date.now() + MANAGE_MAX_AGE_MS);

  const loaded = await asSystem(env, async (sql) => {
    await sql`
      select public.checkout_issue_manage_token(
        ${bookingId}::uuid,
        ${hash},
        ${expires.toISOString()}::timestamptz
      )
    `;
    const rows = await sql`
      select * from public.checkout_booking_for_email(${bookingId}::uuid)
    `;
    const snaps = await sql<{ policy: unknown }[]>`
      select public.booking_snapshot_policy(${bookingId}::uuid) as policy
    `;
    const policy = snaps[0]?.policy ?? null;
    return {
      row: rows[0],
      extras: emailExtrasFromPolicy(
        policy && typeof policy === "object" ? (policy as { extras?: unknown }).extras : null,
      ),
    };
  });

  if (!loaded?.row) return { ok: false, code: "not-found" };
  const booking = loaded.row as Record<string, unknown>;
  const email = String(booking.contact_email ?? "").trim();
  if (!email) return { ok: false, code: "no-email" };

  const locale = asEmailLocale(String(booking.locale ?? "en"));
  const scheduledLocal = String(booking.scheduled_local ?? "");
  const payload: BookingForEmail = {
    reference: String(booking.reference ?? ""),
    contactName: String(booking.contact_name ?? ""),
    contactEmail: email,
    locale,
    displayCurrency: "CHF",
    totalRappen: booking.price_total_rappen == null ? null : Number(booking.price_total_rappen),
    manageUrl: `${PUBLIC_SITE_ORIGIN}/${locale}/manage-booking?token=${raw}`,
    extras: loaded.extras,
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText: String(booking.pickup_text ?? ""),
        dropoffText: String(booking.dropoff_text ?? ""),
        scheduledLocal,
        scheduledAt: scheduledLocal,
        flightNo: booking.flight_no ? String(booking.flight_no) : null,
        vehicleClassLabel: String(booking.vehicle_class_name || booking.vehicle_class_slug || "business"),
        pax: Number(booking.pax ?? 1),
        bags: Number(booking.bags ?? 0),
        estimatedDurationMinutes: null,
      },
    ],
  };

  const outcome = await sendConfirmation({ RESEND_API_KEY: key }, payload);
  if (!outcome.ok) return { ok: false, code: "email-failed" };
  return { ok: true, email };
}
