// apps/web/lib/db/system-reads.ts
//
// Quick 260929-pga. `vamos_system` is definer-only (20260827000002_checkout_roles.sql): it has NO
// table SELECT/UPDATE outside the support tables, so every raw table statement issued through
// asSystem fails with 42501. Each wrapper below is one narrow SECURITY DEFINER function from
// 20260930210000_system_role_narrow_reads.sql, called as vamos_system. Callers keep their own row
// mapping. A new asSystem read of a table belongs here as a function, never as raw SQL.

export const dynamic = "force-dynamic";

import { asSystem } from "./identity";

export type PaidCancelMailRow = {
  reference: string;
  locale: string | null;
  contact_email: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  assigned_chauffeur_id: string | null;
  chauffeur_email: string | null;
};

export type CapturedPaymentRow = { id: number | string; stripe_payment_intent_id: string; charged_rappen: number };

export type UnpaidContactRow = {
  id: string;
  contact_email: string | null;
  locale: string | null;
  is_test: boolean | null;
  locked_rappen: number | null;
};

export type MustFixTripRow = {
  reference: string;
  locale: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
};

export type PhoneBookingUnpaidRow = {
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
  is_test: boolean | null;
  quote_id: string | null;
  snap_expires_at: string | Date | null;
  snap_total_rappen: number | null;
};

export type ManageReviewStateRow = { price_total_rappen: number | null; review_submitted: boolean | null };

export type EditBookingContactRow = { reference: string; contact_email: string | null; locale: string | null };

export type TripForMailRow = {
  booking_id: string;
  reference: string;
  contact_email: string | null;
  locale: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | Date | null;
  booking_leg_id: string;
  chauffeur_email: string | null;
};

export const loadPaidCancelMail = async (env: CloudflareEnv, bookingId: string) =>
  (await asSystem(env, (sql) =>
    sql<PaidCancelMailRow[]>`select * from public.paid_cancel_mail_read(${bookingId}::uuid)`,
  ))[0] ?? null;

/**
 * 261002 settle safety (P-2): the Stripe pages of the change requests a cancel just ended (unpaid, the
 * difference record not expired). Definer function `booking_cancel_change_pages` (migration 20261007200000),
 * a cancelled booking only: any other booking lists nothing. The Worker closes each page best effort.
 */
export const loadCancelChangePages = async (env: CloudflareEnv, bookingId: string): Promise<string[]> =>
  (
    await asSystem(env, (sql) =>
      sql<{ extra_session_id: string | null }[]>`
        select extra_session_id from public.booking_cancel_change_pages(${bookingId}::uuid)`,
    )
  )
    .map((row) => String(row.extra_session_id ?? "").trim())
    .filter((id) => id !== "");

export const loadCapturedPaymentRow = async (env: CloudflareEnv, bookingId: string) =>
  (await asSystem(env, (sql) =>
    sql<CapturedPaymentRow[]>`select * from public.booking_captured_payment(${bookingId}::uuid)`,
  ))[0] ?? null;

export const markRefundProcessing = (env: CloudflareEnv, bookingId: string) =>
  asSystem(env, async (sql) => {
    await sql`select public.booking_refund_processing_mark(${bookingId}::uuid)`;
  });

export const loadPriceChangedUnpaidContacts = (env: CloudflareEnv) =>
  asSystem(env, (sql) => sql<UnpaidContactRow[]>`select * from public.price_changed_unpaid_contacts()`);

export const loadExpiredBookingContact = async (env: CloudflareEnv, bookingId: string) =>
  (await asSystem(env, (sql) =>
    sql<UnpaidContactRow[]>`select * from public.expired_booking_contact(${bookingId}::uuid)`,
  ))[0] ?? null;

export const loadMustFixTrip = async (env: CloudflareEnv, key: string) =>
  (await asSystem(env, (sql) => sql<MustFixTripRow[]>`select * from public.must_fix_trip_read(${key})`))[0] ??
  null;

export const loadPhoneBookingUnpaid = async (env: CloudflareEnv, key: string) =>
  (await asSystem(env, (sql) =>
    sql<PhoneBookingUnpaidRow[]>`select * from public.phone_booking_unpaid_read(${key})`,
  ))[0] ?? null;

export const loadManageReviewState = async (env: CloudflareEnv, bookingId: string) =>
  (await asSystem(env, (sql) =>
    sql<ManageReviewStateRow[]>`select * from public.manage_booking_review_state(${bookingId}::uuid)`,
  ))[0] ?? null;

export const loadEditSnapshotTotal = async (env: CloudflareEnv, snapshotId: string | number) => {
  const rows = await asSystem(env, (sql) =>
    sql<{ total: number | null }[]>`
      select public.edit_request_snapshot_total(${snapshotId}::bigint) as total`,
  );
  const total = rows[0]?.total;
  return total == null ? null : Number(total);
};

export const loadEditBookingContact = async (env: CloudflareEnv, bookingId: string) =>
  (await asSystem(env, (sql) =>
    sql<EditBookingContactRow[]>`select * from public.edit_request_booking_contact(${bookingId}::uuid)`,
  ))[0] ?? null;

export const loadEditPendingPayload = async (env: CloudflareEnv, key: string) =>
  (await asSystem(env, (sql) =>
    sql<{ payload: unknown }[]>`select * from public.edit_request_pending_payload(${key})`,
  ))[0]?.payload;

export const loadTripForMail = async (env: CloudflareEnv, bookingId: string) =>
  (await asSystem(env, (sql) =>
    sql<TripForMailRow[]>`select * from public.booking_trip_for_mail(${bookingId}::uuid)`,
  ))[0] ?? null;

export const loadEditExtraSession = async (env: CloudflareEnv, key: string) =>
  (await asSystem(env, (sql) =>
    sql<{ booking_id: string; extra_session_id: string | null }[]>`
      select * from public.edit_request_extra_session(${key})`,
  ))[0] ?? null;

export const supersedePendingEditRequest = async (env: CloudflareEnv, key: string) =>
  (await asSystem(env, (sql) =>
    sql<{ booking_id: string; request_id: string }[]>`select * from public.edit_request_refuse(${key})`,
  ))[0] ?? null;

export const writeFlightNumber = async (
  env: CloudflareEnv,
  input: { bookingId: string; flightNo: string; actorKind: "customer" | "guest"; actorId: string | null },
) =>
  (await asSystem(env, (sql) =>
    sql<TripForMailRow[]>`
      select * from public.booking_flight_write(
        ${input.bookingId}::uuid, ${input.flightNo}, ${input.actorKind}, ${input.actorId}::uuid)`,
  ))[0] ?? null;

export type CheckoutAccountRequest = {
  email: string;
  choice: "guest" | "create";
  full_name: string;
  locale: string;
};

/** 26.5-05: the account request recorded at PAY for a paid booking (definer, plan 01). */
export const readCheckoutAccountRequest = async (
  env: CloudflareEnv,
  bookingId: string,
): Promise<CheckoutAccountRequest | null> =>
  (await asSystem(env, (sql) =>
    sql<CheckoutAccountRequest[]>`select * from public.checkout_account_request_for_booking(${bookingId}::uuid)`,
  ))[0] ?? null;

export type CheckoutAccountUserState = { user_exists: boolean; confirmed: boolean; checkout_origin: boolean };

/** 26.5-05: booleans only about an auth user for an e-mail (definer, plan 01). */
export const readCheckoutAccountUserState = async (
  env: CloudflareEnv,
  email: string,
): Promise<CheckoutAccountUserState> =>
  (await asSystem(env, (sql) =>
    sql<CheckoutAccountUserState[]>`select * from public.checkout_account_user_state(${email})`,
  ))[0] ?? { user_exists: false, confirmed: false, checkout_origin: false };

/** 27.1: true while an account the public sign-in link made has not finished. Definer, boolean only. */
export const readAccountFinishRequired = async (env: CloudflareEnv, userId: string): Promise<boolean> =>
  (await asSystem(env, (sql) =>
    sql<{ required: boolean }[]>`select public.account_finish_required(${userId}::uuid) as required`,
  ))[0]?.required === true;

/** 27.1: marks the unconfirmed account the sign-in link just made for this address (definer). */
export const markAccountFinishPending = async (env: CloudflareEnv, email: string): Promise<void> => {
  await asSystem(env, (sql) => sql`select public.account_finish_mark(${email})`);
};

/** 27.1: the finish step stored the tick; the account is finished and the customer row gets the name and phone (definer). */
export const markAccountFinished = async (
  env: CloudflareEnv,
  userId: string,
  fullName: string,
  phone: string,
): Promise<void> => {
  await asSystem(env, (sql) => sql`select public.account_finish_done(${userId}::uuid, ${fullName}, ${phone})`);
};
