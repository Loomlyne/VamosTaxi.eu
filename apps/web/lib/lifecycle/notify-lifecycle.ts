// apps/web/lib/lifecycle/notify-lifecycle.ts
//
// 09-06: claim-then-send for lifecycle Resend. asSystem claim RPC;
// if null skip send; else send; settle with Resend message id.
//
// Dedupe via the claim RPC (built inside the function):
//   {bookingId}:cancellation:
//   {bookingId}:refund_failed:
//   {bookingId}:reminder_24h:{legId}
//   {bookingId}:assignment_customer:
//   {bookingId}:time_change:{requestId}  — pass booking_leg_id (FK); not an edit-request id
//   {bookingId}:flight_no:
//   {bookingId}:review_request:
//
// D-30 ops copies: BOOKINGS_OPS_EMAIL (bookings@vamostaxi.site). Never the public mailbox.
// Do not edit paid-cancel.ts here. No WhatsApp. No SMS.

export const dynamic = "force-dynamic";

import {
  sendAssignmentCustomer,
  sendCancellation,
  sendFlightNumber,
  sendRefundFailed,
  sendReminder24h,
  sendReviewRequest,
  sendTimeChange,
  type AssignmentCustomerForEmail,
  type CancellationForEmail,
  type EmailEnv,
  type FlightNumberForEmail,
  type RefundFailedForEmail,
  type Reminder24hForEmail,
  type ReviewRequestForEmail,
  type SendOutcome,
  type TimeChangeForEmail,
} from "@vamos/emails/confirmation";
import { asSystem } from "../db/identity";

const BOOKINGS_OPS_EMAIL = "bookings@vamostaxi.site";

export type LifecycleKind =
  | "cancellation"
  | "refund_failed"
  | "reminder_24h"
  | "assignment_customer"
  | "time_change"
  | "flight_no"
  | "review_request";

const TEMPLATE_VERSION: Record<LifecycleKind, string> = {
  cancellation: "cancellation@2026-09-12-1",
  refund_failed: "refund_failed@2026-09-12-1",
  reminder_24h: "reminder_24h@2026-09-12-1",
  assignment_customer: "assignment_customer@2026-09-12-1",
  time_change: "time_change@2026-09-12-1",
  flight_no: "flight_no@2026-09-12-1",
  review_request: "review_request@2026-09-12-1",
};

type ClaimInput = {
  bookingId: string;
  kind: LifecycleKind;
  locale: string;
  bookingLegId?: string | null;
};

function mailEnv(env: CloudflareEnv): EmailEnv | null {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) return null;
  return { RESEND_API_KEY: key };
}

function uniqueRecipients(to: Array<string | null | undefined>): string[] {
  return [...new Set(to.map((addr) => (addr ?? "").trim().toLowerCase()).filter(Boolean))];
}

async function claimThenSend(
  env: CloudflareEnv,
  claim: ClaimInput,
  send: () => Promise<SendOutcome>,
): Promise<void> {
  if (!mailEnv(env)) return;

  const claimId = await asSystem(env, async (sql) => {
    const rows = await sql`
      select public.notification_claim(
        ${claim.bookingId}::uuid,
        ${claim.kind},
        ${claim.bookingLegId ?? null}::uuid,
        ${"email"},
        ${claim.locale},
        ${TEMPLATE_VERSION[claim.kind]}
      ) as id
    `;
    const id = rows[0]?.id;
    return id == null ? null : Number(id);
  });

  if (claimId == null) return;

  let outcome: SendOutcome;
  try {
    outcome = await send();
  } catch (err) {
    outcome = { ok: false, error: err instanceof Error ? err.message : "send failed" };
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

export type CancellationNotify = CancellationForEmail & {
  bookingId: string;
  customerEmail: string;
  chauffeurEmail?: string | null;
  assigned?: boolean;
};

export async function notifyCancellation(
  env: CloudflareEnv,
  trip: CancellationNotify,
): Promise<void> {
  const mail = mailEnv(env);
  if (!mail) return;
  const assigned = Boolean(trip.assigned || trip.chauffeurEmail);
  await claimThenSend(
    env,
    { bookingId: trip.bookingId, kind: "cancellation", locale: trip.locale },
    async () => {
      const customer = await sendCancellation(mail, { ...trip, urgent: false }, trip.customerEmail);
      const ops = await sendCancellation(mail, { ...trip, urgent: assigned }, BOOKINGS_OPS_EMAIL);
      if (trip.chauffeurEmail) {
        await sendCancellation(mail, { ...trip, urgent: false }, trip.chauffeurEmail);
      }
      return customer.ok ? customer : ops;
    },
  );
}

export type RefundFailedNotify = RefundFailedForEmail & {
  bookingId: string;
};

export async function notifyRefundFailed(
  env: CloudflareEnv,
  trip: RefundFailedNotify,
): Promise<void> {
  const mail = mailEnv(env);
  if (!mail) return;
  await claimThenSend(
    env,
    { bookingId: trip.bookingId, kind: "refund_failed", locale: trip.locale },
    () => sendRefundFailed(mail, trip, BOOKINGS_OPS_EMAIL),
  );
}

export type Reminder24hNotify = Reminder24hForEmail & {
  bookingId: string;
  bookingLegId: string;
  customerEmail: string;
};

export async function notifyReminder24h(
  env: CloudflareEnv,
  trip: Reminder24hNotify,
): Promise<void> {
  const mail = mailEnv(env);
  if (!mail) return;
  const unassigned = Boolean(trip.opsUnassigned) || !trip.chauffeurName;
  await claimThenSend(
    env,
    {
      bookingId: trip.bookingId,
      kind: "reminder_24h",
      locale: trip.locale,
      bookingLegId: trip.bookingLegId,
    },
    async () => {
      const customer = await sendReminder24h(mail, trip, trip.customerEmail);
      if (unassigned) {
        await sendReminder24h(mail, { ...trip, opsUnassigned: true }, BOOKINGS_OPS_EMAIL);
      }
      return customer;
    },
  );
}

export type AssignmentCustomerNotify = AssignmentCustomerForEmail & {
  bookingId: string;
  customerEmail: string;
};

export async function notifyAssignmentCustomer(
  env: CloudflareEnv,
  trip: AssignmentCustomerNotify,
): Promise<void> {
  const mail = mailEnv(env);
  if (!mail) return;
  await claimThenSend(
    env,
    { bookingId: trip.bookingId, kind: "assignment_customer", locale: trip.locale },
    () => sendAssignmentCustomer(mail, trip, trip.customerEmail),
  );
}

export type TimeChangeNotify = TimeChangeForEmail & {
  bookingId: string;
  customerEmail: string;
  chauffeurEmail?: string | null;
  bookingLegId?: string | null;
};

export async function notifyTimeChange(
  env: CloudflareEnv,
  trip: TimeChangeNotify,
): Promise<void> {
  const mail = mailEnv(env);
  if (!mail) return;
  const confirmed = trip.outcome === "confirmed";
  const to = uniqueRecipients(
    confirmed
      ? [trip.customerEmail, BOOKINGS_OPS_EMAIL, trip.chauffeurEmail]
      : [trip.customerEmail],
  );
  await claimThenSend(
    env,
    {
      bookingId: trip.bookingId,
      kind: "time_change",
      locale: trip.locale,
      bookingLegId: trip.bookingLegId,
    },
    () => sendTimeChange(mail, trip, to),
  );
}

export type FlightNumberNotify = FlightNumberForEmail & {
  bookingId: string;
  chauffeurEmail?: string | null;
};

export async function notifyFlightNumber(
  env: CloudflareEnv,
  trip: FlightNumberNotify,
): Promise<void> {
  const mail = mailEnv(env);
  if (!mail) return;
  const to = uniqueRecipients([BOOKINGS_OPS_EMAIL, trip.chauffeurEmail]);
  await claimThenSend(
    env,
    { bookingId: trip.bookingId, kind: "flight_no", locale: trip.locale },
    () => sendFlightNumber(mail, trip, to),
  );
}

export type ReviewRequestNotify = ReviewRequestForEmail & {
  bookingId: string;
  customerEmail: string;
};

export async function notifyReviewRequest(
  env: CloudflareEnv,
  trip: ReviewRequestNotify,
): Promise<void> {
  const mail = mailEnv(env);
  if (!mail) return;
  await claimThenSend(
    env,
    { bookingId: trip.bookingId, kind: "review_request", locale: trip.locale },
    () => sendReviewRequest(mail, trip, trip.customerEmail),
  );
}
