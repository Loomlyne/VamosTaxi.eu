// apps/web/lib/ops/edit-request.ts
//
// 08-07: paid-edit request + ops accept. Extra Checkout Session is the
// fare difference only (D-67). Merge supersedes the previous requested row
// and expires the old extra session when the amount changed (D-73).
// Stripe-first difference refund uses 08-05 createRefund. Never asStaff INSERT
// payments. Hyperdrive DIRECT only.

export const dynamic = "force-dynamic";

import type { VamosClaims } from "@/lib/db/identity";
import { asSystem } from "@/lib/db/identity";
import {
  createCheckoutSession,
  createRefund,
  expireCheckoutSession,
  retrieveCheckoutSession,
  sessionIsPayable,
  stripeFromEnv,
} from "@/lib/checkout/stripe";
import type { CheckoutLocale } from "@/lib/checkout/currency";
import { verifyLock } from "@/lib/quote/lock";
import { PUBLIC_SITE_ORIGIN } from "./phone-booking-map";
import {
  extraCheckoutMetadata,
  fareDifferenceRappen,
  mapEditSqlError,
  shouldExpireOldExtraSession,
  type EditAcceptFail,
  type EditPayload,
} from "./edit-request-map";
import { deliverOverlapMustFix } from "./must-fix-mail";

export type { AcceptOutcome, EditPayload } from "./edit-request-map";
export { extraCheckoutMetadata, fareDifferenceRappen, mapEditSqlError, shouldExpireOldExtraSession };

export type EditAcceptOk = {
  ok: true;
  outcome: "applied" | "extra_required" | "refund_immediate" | "refund_click";
  requestId: string;
  bookingId: string;
  differenceRappen: number;
  extraSessionId: string | null;
};

export type EditAcceptResult = EditAcceptOk | EditAcceptFail;

export type AcceptPaidEditInput = {
  payload: EditPayload;
  requestId?: string;
  quoteSnapshotId?: number;
  lock?: string;
  vehicleClassSlug?: string;
};

function checkoutLocale(raw: string): CheckoutLocale {
  if (raw === "de" || raw === "fr" || raw === "ar") return raw;
  return "en";
}

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

export async function acceptPaidEdit(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  input: AcceptPaidEditInput,
): Promise<EditAcceptResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  const secret = env.STRIPE_SECRET_KEY ?? "";
  if (secret.startsWith("sk_live_")) {
    return { ok: false, code: "stripe-test-only" };
  }

  type UpsertRow = {
    request_id: string;
    superseded_id: string | null;
    old_extra_session_id: string | null;
    old_extra_snapshot_id: number | null;
  };

  let upsert: UpsertRow | null = null;
  let requestId = (input.requestId ?? "").trim();

  if (!requestId) {
    try {
      upsert = await asSystem(env, async (sql) => {
        const bookingId = await resolveBookingId(sql, key);
        if (!bookingId) throw Object.assign(new Error("not-found"), { code: "P0002" });

        let quoteSnapshotId = input.quoteSnapshotId ?? 0;
        if (!Number.isFinite(quoteSnapshotId) || quoteSnapshotId <= 0) {
          let newTotal: number | null = null;
          let quoteId: string | null = null;
          const lockToken = (input.lock ?? "").trim();
          if (lockToken) {
            const current = env.QUOTE_LOCK_SECRET || "";
            const previous = env.QUOTE_LOCK_SECRET_PREVIOUS;
            const verified = await verifyLock(
              previous ? { current, previous } : { current },
              lockToken,
              new Date().toISOString(),
            );
            if (!verified.ok) throw Object.assign(new Error("not-found"), { code: "P0002" });
            const slug = (input.vehicleClassSlug ?? input.payload.vehicle_class_slug ?? "economy")
              .trim()
              .toLowerCase();
            const row = verified.payload.class_totals.find((c) => c.slug === slug);
            if (row?.total_rappen == null) throw Object.assign(new Error("not-found"), { code: "P0002" });
            newTotal = Number(row.total_rappen);
            quoteId = verified.payload.quote_id;
          }
          const cloned = await sql<{ id: number }[]>`
            select public.booking_edit_clone_quote_snapshot(
              ${bookingId}::uuid,
              ${newTotal}::rappen,
              ${quoteId}::uuid
            ) as id
          `;
          quoteSnapshotId = Number(cloned[0]?.id ?? 0);
        }
        if (!Number.isFinite(quoteSnapshotId) || quoteSnapshotId <= 0) {
          throw Object.assign(new Error("not-found"), { code: "P0002" });
        }

        const rows = await sql<UpsertRow[]>`
          select * from public.booking_edit_request_upsert(
            ${bookingId}::uuid,
            'staff',
            ${claims.sub}::uuid,
            ${JSON.stringify(input.payload)}::jsonb,
            ${quoteSnapshotId}::bigint
          )
        `;
        const row = rows[0];
        if (!row) throw Object.assign(new Error("not-found"), { code: "P0002" });
        return {
          request_id: String(row.request_id),
          superseded_id: row.superseded_id ? String(row.superseded_id) : null,
          old_extra_session_id: row.old_extra_session_id ? String(row.old_extra_session_id) : null,
          old_extra_snapshot_id:
            row.old_extra_snapshot_id == null ? null : Number(row.old_extra_snapshot_id),
        };
      });
      requestId = upsert.request_id;
    } catch (err) {
      return mapEditSqlError(err);
    }
  }

  type AcceptRow = {
    request_id: string;
    booking_id: string;
    outcome: string;
    difference_rappen: number;
    extra_snapshot_id: number | null;
    extra_session_id: string | null;
    hours_before: number | null;
    original_payment_id: number | null;
    original_intent_id: string | null;
  };

  let accepted: AcceptRow;
  try {
    accepted = await asSystem(env, async (sql) => {
      const rows = await sql<AcceptRow[]>`
        select * from public.booking_edit_request_accept(
          ${requestId}::uuid,
          ${claims.sub}::uuid
        )
      `;
      const row = rows[0];
      if (!row) throw Object.assign(new Error("not-found"), { code: "P0002" });
      return {
        request_id: String(row.request_id),
        booking_id: String(row.booking_id),
        outcome: String(row.outcome),
        difference_rappen: Number(row.difference_rappen),
        extra_snapshot_id: row.extra_snapshot_id == null ? null : Number(row.extra_snapshot_id),
        extra_session_id: row.extra_session_id ? String(row.extra_session_id) : null,
        hours_before: row.hours_before == null ? null : Number(row.hours_before),
        original_payment_id: row.original_payment_id == null ? null : Number(row.original_payment_id),
        original_intent_id: row.original_intent_id ? String(row.original_intent_id) : null,
      };
    });
  } catch (err) {
    const mapped = mapEditSqlError(err);
    if (mapped.code === "must-fix") {
      try {
        await deliverOverlapMustFix(env, requestId || key);
      } catch {
        // Trip is not auto-cancelled. Mail is best-effort.
      }
    }
    return mapped;
  }

  if (accepted.outcome === "applied") {
    return {
      ok: true,
      outcome: "applied",
      requestId: accepted.request_id,
      bookingId: accepted.booking_id,
      differenceRappen: 0,
      extraSessionId: null,
    };
  }

  if (accepted.outcome === "refund_click") {
    return {
      ok: true,
      outcome: "refund_click",
      requestId: accepted.request_id,
      bookingId: accepted.booking_id,
      differenceRappen: accepted.difference_rappen,
      extraSessionId: null,
    };
  }

  if (accepted.outcome === "refund_immediate") {
    const refundRappen = Math.abs(accepted.difference_rappen);
    if (refundRappen <= 0 || !accepted.original_intent_id) {
      return { ok: false, code: "unknown" };
    }
    let refundId = "";
    try {
      const stripe = stripeFromEnv(env);
      const refund = await createRefund(stripe, {
        paymentIntentId: accepted.original_intent_id,
        amountRappen: refundRappen,
        idempotencyKey: `edit-refund:${accepted.request_id}:${refundRappen}`,
      });
      if (!refund?.id) return { ok: false, code: "stripe-failed" };
      refundId = refund.id;
    } catch {
      return { ok: false, code: "stripe-failed" };
    }
    try {
      await asSystem(env, async (sql) => {
        await sql`
          select * from public.booking_edit_refund_record(
            ${accepted.request_id}::uuid,
            ${refundId}::text,
            ${claims.sub}::uuid,
            ${refundRappen}::rappen
          )
        `;
      });
    } catch (err) {
      return mapEditSqlError(err);
    }
    return {
      ok: true,
      outcome: "refund_immediate",
      requestId: accepted.request_id,
      bookingId: accepted.booking_id,
      differenceRappen: accepted.difference_rappen,
      extraSessionId: null,
    };
  }

  if (accepted.outcome !== "extra_required") {
    return { ok: false, code: "unknown" };
  }

  const difference = fareDifferenceRappen(accepted.difference_rappen, 0);
  if (difference <= 0) return { ok: false, code: "unknown" };

  const stripe = stripeFromEnv(env);
  let reuseSessionId: string | null = null;
  const oldSessionId = upsert?.old_extra_session_id ?? null;
  let oldExtraTotal: number | null = null;
  if (upsert?.old_extra_snapshot_id != null) {
    oldExtraTotal = await asSystem(env, async (sql) => {
      const rows = await sql<{ total_rappen: number }[]>`
        select total_rappen
          from public.price_snapshots
         where id = ${upsert.old_extra_snapshot_id}::bigint
      `;
      const total = rows[0]?.total_rappen;
      return total == null ? null : Number(total);
    });
  }

  if (oldSessionId && !shouldExpireOldExtraSession(oldExtraTotal, difference)) {
    try {
      const existing = await retrieveCheckoutSession(stripe, oldSessionId);
      if (sessionIsPayable(existing, difference)) {
        reuseSessionId = oldSessionId;
      }
    } catch {
      reuseSessionId = null;
    }
  }

  if (oldSessionId && reuseSessionId !== oldSessionId) {
    try {
      await expireCheckoutSession(stripe, oldSessionId);
    } catch {
      // Already expired / consumed — merge still proceeds with one extra payment.
    }
  }

  let extraSessionId = reuseSessionId;
  if (!extraSessionId) {
    const booking = await asSystem(env, async (sql) => {
      const rows = await sql<
        { reference: string; contact_email: string | null; locale: string | null }[]
      >`
        select reference, contact_email, locale
          from public.bookings
         where id = ${accepted.booking_id}::uuid
      `;
      return rows[0] ?? null;
    });
    if (!booking) return { ok: false, code: "not-found" };
    const email = String(booking.contact_email ?? "").trim();
    if (!email) return { ok: false, code: "not-found" };
    const reference = String(booking.reference);
    const locale = checkoutLocale(String(booking.locale ?? "en"));
    const meta = extraCheckoutMetadata(accepted.booking_id, accepted.request_id);
    try {
      const session = await createCheckoutSession(stripe, {
        chargedRappen: difference,
        bookingId: meta.booking_id,
        bookingReference: reference,
        customerEmail: email,
        locale,
        idempotencyKey: `extra:${accepted.request_id}:${difference}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        returnUrl: `${PUBLIC_SITE_ORIGIN}/confirmation/${encodeURIComponent(reference)}`,
        productName: "Fare difference",
        extra: { extraId: meta.extra_id },
      });
      extraSessionId = session.id;
    } catch {
      return { ok: false, code: "stripe-failed" };
    }
  }

  try {
    await asSystem(env, async (sql) => {
      await sql`
        select public.booking_edit_request_set_extra_session(
          ${accepted.request_id}::uuid,
          ${extraSessionId}::text
        )
      `;
    });
  } catch (err) {
    return mapEditSqlError(err);
  }

  return {
    ok: true,
    outcome: "extra_required",
    requestId: accepted.request_id,
    bookingId: accepted.booking_id,
    differenceRappen: difference,
    extraSessionId,
  };
}
