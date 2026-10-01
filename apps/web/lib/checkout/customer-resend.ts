// apps/web/lib/checkout/customer-resend.ts
//
// 26.2 P6, D19 (owner, 2026-10-01): the customer's "Resend email" on the booking views sends the
// confirmation again — the same mail the dashboard's Resend voucher sends, with a fresh manage
// link — to the booking's own address. Before, both views said "Sent" and sent nothing.
// The booking is the one the visitor may see: the manage-link token (asGuest) or the signed-in
// owner (asCustomer), the same doors as the time change and the flight number. An unpaid booking
// has no confirmation to send.
//
// D20 (owner, 2026-10-02: "Resend the cancellation mail instead on a cancelled trip"): a cancelled
// trip gets the cancellation e-mail again, to the customer only, with the refund line its
// cancellation recorded. Never the "Booked" mail, no copy to bookings@ or the driver.

export const dynamic = "force-dynamic";

import { sendCancellation, type CancellationRefundLine } from "@vamos/emails/confirmation";
import { asCustomer, asGuest, asSystem } from "@/lib/db/identity";
import { deliverBookingConfirmation } from "@/lib/ops/voucher";
import type { CustomerEditAuth } from "@/lib/ops/edit-request";

export type CustomerResendResult =
  | { ok: true; bookingId: string; email: string; mail: "confirmation" | "cancellation" }
  | { ok: false; code: "not-found" | "not-sent" };

function isCancelled(status: string): boolean {
  return status === "cancelled" || status === "partially_cancelled" || status === "refunded";
}

type CancelResendFacts = {
  reference: string;
  locale: string | null;
  contact_email: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  refund_mode: string | null;
  refund_rappen: number | null;
};

/** The refund line the cancellation e-mail carried, by the same rule as finishPaidCancel. */
function refundLineOf(mode: string | null, rappen: number | null): CancellationRefundLine {
  if (mode === "auto_full" && Number(rappen ?? 0) > 0) return "full_captured";
  return mode === "pending_ops" ? "pending_ops" : "none";
}

function emailLocale(locale: string | null): "en" | "de" | "fr" | "ar" {
  return locale === "de" || locale === "fr" || locale === "ar" ? locale : "en";
}

/** D20: the cancellation e-mail again, to the booking's address only. */
async function resendCancellation(env: CloudflareEnv, bookingId: string): Promise<CustomerResendResult> {
  const facts = (
    await asSystem(env, (sql) =>
      sql<CancelResendFacts[]>`select * from public.booking_cancel_resend_facts(${bookingId}::uuid)`,
    )
  )[0];
  // A trip cancelled before it was paid never had this e-mail.
  if (!facts) return { ok: false, code: "not-found" };
  const email = String(facts.contact_email ?? "").trim();
  const key = env.RESEND_API_KEY ?? "";
  if (!email || !key) return { ok: false, code: "not-sent" };
  const sent = await sendCancellation(
    { RESEND_API_KEY: key },
    {
      reference: String(facts.reference),
      locale: emailLocale(facts.locale),
      pickupText: String(facts.pickup_text ?? ""),
      dropoffText: String(facts.dropoff_text ?? ""),
      scheduledLocal: String(facts.scheduled_local ?? ""),
      refundLine: refundLineOf(facts.refund_mode, facts.refund_rappen),
      urgent: false,
    },
    email,
  );
  if (!sent.ok) return { ok: false, code: "not-sent" };
  return { ok: true, bookingId, email, mail: "cancellation" };
}

type Owned = { id: string; status: string };

/** The booking the visitor may see, by id or reference. Only columns both customer roles may read. */
async function visibleBooking(env: CloudflareEnv, auth: CustomerEditAuth, key: string): Promise<Owned | null> {
  const query = async (sql: Parameters<Parameters<typeof asCustomer>[2]>[0]): Promise<Owned | null> => {
    const rows = await sql<Owned[]>`
      select b.id::text as id, b.status::text as status
        from public.bookings as b
       where b.id::text = ${key} or b.reference = ${key}
       limit 1
    `;
    return rows[0] ?? null;
  };
  if (auth.kind === "customer") return asCustomer(env, auth.claims, query);
  if (!auth.manageTokenHashHex) return null;
  return asGuest(env, auth.manageTokenHashHex, query);
}

export async function resendCustomerConfirmation(
  env: CloudflareEnv,
  auth: CustomerEditAuth,
  bookingKey: string,
): Promise<CustomerResendResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  if (auth.kind === "guest" && !auth.manageTokenHashHex) return { ok: false, code: "not-found" };
  const owned = await visibleBooking(env, auth, key);
  if (!owned || owned.status === "quote" || owned.status === "pending") return { ok: false, code: "not-found" };
  if (isCancelled(owned.status)) return resendCancellation(env, owned.id);
  const sent = await deliverBookingConfirmation(env, owned.id);
  if (!sent.ok) return { ok: false, code: sent.code === "not-found" ? "not-found" : "not-sent" };
  return { ok: true, bookingId: owned.id, email: sent.email, mail: "confirmation" };
}
