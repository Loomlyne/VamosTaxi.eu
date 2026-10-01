// apps/web/lib/checkout/customer-resend.ts
//
// 26.2 P6, D19 (owner, 2026-10-01): the customer's "Resend email" on the booking views sends the
// confirmation again — the same mail the dashboard's Resend voucher sends, with a fresh manage
// link — to the booking's own address. Before, both views said "Sent" and sent nothing.
// The booking is the one the visitor may see: the manage-link token (asGuest) or the signed-in
// owner (asCustomer), the same doors as the time change and the flight number. An unpaid booking
// has no confirmation to send.

export const dynamic = "force-dynamic";

import { asCustomer, asGuest } from "@/lib/db/identity";
import { deliverBookingConfirmation } from "@/lib/ops/voucher";
import type { CustomerEditAuth } from "@/lib/ops/edit-request";

export type CustomerResendResult =
  | { ok: true; bookingId: string; email: string }
  | { ok: false; code: "not-found" | "not-sent" };

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
  const sent = await deliverBookingConfirmation(env, owned.id);
  if (!sent.ok) return { ok: false, code: sent.code === "not-found" ? "not-found" : "not-sent" };
  return { ok: true, bookingId: owned.id, email: sent.email };
}
