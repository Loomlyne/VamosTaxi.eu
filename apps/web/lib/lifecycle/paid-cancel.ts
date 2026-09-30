// apps/web/lib/lifecycle/paid-cancel.ts
//
// 20-10 refunds by hand: a cancel sends the mail and calls no Stripe. The admin sends the refund.
// D-08 never restores a prior status. 09-07 D-11/D-14: notifyCancellation after success;
// assigned chauffeur → URGENT ops.

export const dynamic = "force-dynamic";

import { asCustomer, asGuest, asSystem, type VamosClaims } from "../db/identity";
import { loadPaidCancelMail } from "../db/system-reads";
import { notifyCancellation } from "./notify-lifecycle";

export type PaidCancelOk = {
  ok: true;
  bookingId: string;
  refundMode: string;
  refundStatus: string;
  refundRappen: number;
  payoutCountry?: string | null;
  availableOn?: string | null;
};

export type PaidCancelFail = { ok: false; code: string };

export type PaidCancelResult = PaidCancelOk | PaidCancelFail;

type CancelledRow = {
  booking_id: string;
  refund_mode: string;
  refund_rappen: number | string | null;
  stripe_payment_intent_id: string | null;
};

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

function sqlCodeOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("code" in err)) return "";
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : "";
}

export function mapCancelSqlError(err: unknown): PaidCancelFail {
  const message = messageOf(err);
  const code = sqlCodeOf(err);
  if (message === "not_found" || message === "not-found" || code === "P0002") {
    return { ok: false, code: "not-found" };
  }
  if (message.startsWith("not_cancellable") || message.startsWith("not-cancellable")) {
    return { ok: false, code: "not-cancellable" };
  }
  if (message.startsWith("unpaid_use_hard_delete")) {
    return { ok: false, code: "unpaid-use-hard-delete" };
  }
  return { ok: false, code: "unknown" };
}

export function payoutFactsFromRefund(refund: {
  charge?: unknown;
  balance_transaction?: unknown;
}): { payoutCountry: string; availableOn: string | null } {
  let payoutCountry = "CH";
  const charge = refund.charge;
  if (charge && typeof charge === "object") {
    const details = (charge as { payment_method_details?: { card?: { country?: string | null } } })
      .payment_method_details;
    const country = details?.card?.country;
    if (typeof country === "string" && country.trim()) {
      payoutCountry = country.trim().toUpperCase();
    }
  }

  let availableOn: string | null = null;
  const bt = refund.balance_transaction;
  if (bt && typeof bt === "object") {
    const unix = (bt as { available_on?: unknown }).available_on;
    if (typeof unix === "number" && Number.isFinite(unix) && unix > 0) {
      availableOn = new Date(unix * 1000).toISOString();
    }
  }
  return { payoutCountry, availableOn };
}

type CancelMailRow = {
  reference: string;
  locale: string | null;
  contact_email: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  assigned_chauffeur_id: string | null;
  chauffeur_email: string | null;
};

function asEmailLocale(locale: string): "en" | "de" | "fr" | "ar" {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

async function loadCancelMail(env: CloudflareEnv, bookingId: string): Promise<CancelMailRow | null> {
  return loadPaidCancelMail(env, bookingId);
}

async function notifyPaidCancelMails(
  env: CloudflareEnv,
  bookingId: string,
  refundLine: "pending_ops" | "full_captured" | "none",
): Promise<void> {
  try {
    const row = await loadCancelMail(env, bookingId);
    if (!row) return;
    const customerEmail = String(row.contact_email ?? "").trim();
    const locale = asEmailLocale(String(row.locale ?? "en"));
    const assigned = row.assigned_chauffeur_id != null;
    if (customerEmail) {
      await notifyCancellation(env, {
        bookingId,
        reference: String(row.reference),
        locale,
        customerEmail,
        pickupText: String(row.pickup_text ?? ""),
        dropoffText: String(row.dropoff_text ?? ""),
        scheduledLocal: String(row.scheduled_local ?? ""),
        refundLine,
        assigned,
        chauffeurEmail: assigned ? row.chauffeur_email : null,
      });
    }
  } catch {
    // Cancel already committed. Mail is best-effort.
  }
}

/**
 * 20-10 refunds by hand: a cancel never calls Stripe. The database already left the booking
 * cancelled with `pending_ops` (owed = captured for the full tier, owed null inside 24 h).
 * The customer gets the cancellation mail with the matching refund line; the admin sends the
 * refund from the dashboard.
 */
export async function finishPaidCancel(env: CloudflareEnv, row: CancelledRow): Promise<PaidCancelResult> {
  const bookingId = String(row.booking_id);
  const refundMode = String(row.refund_mode ?? "");
  const rawRappen = Number(row.refund_rappen ?? 0);
  const refundRappen = Number.isFinite(rawRappen) && rawRappen > 0 ? rawRappen : 0;
  const fullDue = refundMode === "auto_full" && refundRappen > 0;
  const refundLine = fullDue ? "full_captured" : refundMode === "pending_ops" ? "pending_ops" : "none";

  await notifyPaidCancelMails(env, bookingId, refundLine);
  return {
    ok: true,
    bookingId,
    refundMode,
    refundStatus: fullDue || refundMode === "pending_ops" ? "pending_ops" : "none",
    refundRappen: fullDue ? refundRappen : 0,
  };
}

export async function paidCancelGuest(
  env: CloudflareEnv,
  tokenHashHex: string,
): Promise<PaidCancelResult> {
  if (!tokenHashHex) return { ok: false, code: "not-found" };
  let row: CancelledRow | undefined;
  try {
    row = await asGuest(env, tokenHashHex, async (sql) => {
      const rows = await sql<CancelledRow[]>`
        select * from public.manage_booking_cancel(decode(${tokenHashHex}, 'hex'))
      `;
      return rows[0];
    });
  } catch (err) {
    return mapCancelSqlError(err);
  }
  if (!row?.booking_id) return { ok: false, code: "not-found" };
  return finishPaidCancel(env, row);
}

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOKING_REF = /^VT-\d{2}-\d{4,5}$/i;

export async function paidCancelCustomer(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<PaidCancelResult> {
  const key = bookingKey.trim();
  if (!key || (!BOOKING_UUID.test(key) && !BOOKING_REF.test(key))) {
    return { ok: false, code: "not-found" };
  }
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!email) return { ok: false, code: "unauthorized" };

  let bookingId: string | undefined;
  try {
    bookingId = await asCustomer(env, claims, async (sql) => {
      const rows = await sql<{ id: string }[]>`
        select b.id
          from public.bookings as b
         where b.erased_at is null
           and lower(b.contact_email::text) = lower(${email})
           and (b.id::text = ${key} or b.reference = ${key})
         limit 1
      `;
      return rows[0]?.id;
    });
  } catch (err) {
    return mapCancelSqlError(err);
  }
  if (!bookingId) return { ok: false, code: "not-found" };

  let row: CancelledRow | undefined;
  try {
    row = await asSystem(env, async (sql) => {
      const rows = await sql<CancelledRow[]>`
        select * from public.customer_paid_cancel(${bookingId}::uuid)
      `;
      return rows[0];
    });
  } catch (err) {
    return mapCancelSqlError(err);
  }
  if (!row?.booking_id) return { ok: false, code: "not-found" };
  return finishPaidCancel(env, row);
}
