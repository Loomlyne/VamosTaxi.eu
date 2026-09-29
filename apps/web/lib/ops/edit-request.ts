// apps/web/lib/ops/edit-request.ts
//
// 08-07: paid-edit request + ops accept. Extra Checkout Session is the
// fare difference only (D-67). Merge supersedes the previous requested row
// and expires the old extra session when the amount changed (D-73).
// Stripe-first difference refund uses 08-05 createRefund. Never asStaff INSERT
// payments. Hyperdrive DIRECT only.

export const dynamic = "force-dynamic";

import type { VamosClaims } from "@/lib/db/identity";
import { asCustomer, asGuest, asSystem } from "@/lib/db/identity";
import { notifyFlightNumber, notifyTimeChange } from "@/lib/lifecycle/notify-lifecycle";
import {
  createCheckoutSession,
  createRefund,
  expireCheckoutSession,
  retrieveCheckoutSession,
  hostedSessionIsPayable,
  stripeFromEnv,
} from "@/lib/checkout/stripe";
import type { CheckoutLocale } from "@/lib/checkout/currency";
import { verifyLock } from "@/lib/quote/lock";
import { zurichLocalToUtcMs } from "../geo/serviceArea";
import { PUBLIC_SITE_ORIGIN } from "./phone-booking-map";
import { stripeCheckoutReturnUrl } from "@/lib/checkout/return-url";
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

export const DASHBOARD_ORIGIN = "https://dashboard.vamostaxi.site";

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

export type CustomerEditAuth =
  | { kind: "customer"; claims: VamosClaims }
  | { kind: "guest"; manageTokenHashHex: string };

export type RequestPaidEditInput = {
  payload: EditPayload;
  quoteSnapshotId?: number;
  lock?: string;
  vehicleClassSlug?: string;
};

export type RequestPaidEditOk = {
  ok: true;
  requestId: string;
  bookingId: string;
  status: "requested";
};

export type RequestPaidEditResult = RequestPaidEditOk | EditAcceptFail;

type OwnedBooking = { id: string };

type UpsertRow = {
  request_id: string;
  superseded_id: string | null;
  old_extra_session_id: string | null;
  old_extra_snapshot_id: number | null;
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
  dashboardOrigin: string = DASHBOARD_ORIGIN,
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
        bookingId: accepted.booking_id,
        paymentId: accepted.original_payment_id ?? 0,
        reason: "modification_credit",
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
      if (hostedSessionIsPayable(existing, difference)) {
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
        // D-48: Stripe's hosted page, no card form of ours. Paid returns through
        // the settle route to the confirmation; Back returns to the ops booking.
        uiMode: "hosted_page",
        successUrl: stripeCheckoutReturnUrl(PUBLIC_SITE_ORIGIN, locale),
        cancelUrl: `${dashboardOrigin.replace(/\/$/, "")}/bookings/${encodeURIComponent(reference)}`,
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

async function loadOwnedBooking(
  env: CloudflareEnv,
  auth: CustomerEditAuth,
  key: string,
): Promise<OwnedBooking | null> {
  const query = async (
    sql: Parameters<Parameters<typeof asSystem>[1]>[0],
  ): Promise<OwnedBooking | null> => {
    const rows = await sql<OwnedBooking[]>`
      select b.id
        from public.bookings b
       where b.erased_at is null
         and (b.id::text = ${key} or b.reference = ${key})
       limit 1
    `;
    return rows[0] ?? null;
  };
  if (auth.kind === "customer") {
    return asCustomer(env, auth.claims, query);
  }
  if (!auth.manageTokenHashHex) return null;
  return asGuest(env, auth.manageTokenHashHex, query);
}

/**
 * Customer/guest paid-edit request. Writes `booking_edit_requests` `requested`.
 * Does not mutate booking columns. Same-price still requested (D-74).
 * Identity is JWT email (asCustomer) or manage token (asGuest); upsert is asSystem.
 * Never asStaff from this door.
 */
export async function requestCustomerPaidEdit(
  env: CloudflareEnv,
  auth: CustomerEditAuth,
  bookingKey: string,
  input: RequestPaidEditInput,
): Promise<RequestPaidEditResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  const owned = await loadOwnedBooking(env, auth, key);
  if (!owned) return { ok: false, code: "not-found" };

  const actorId = auth.kind === "customer" ? auth.claims.sub : null;

  try {
    const upsert = await asSystem(env, async (sql) => {
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
            ${owned.id}::uuid,
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
          ${owned.id}::uuid,
          'customer',
          ${actorId}::uuid,
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
    return {
      ok: true,
      requestId: upsert.request_id,
      bookingId: owned.id,
      status: "requested",
    };
  } catch (err) {
    return mapEditSqlError(err);
  }
}

/**
 * D-23: customer time-change writes booking_edit_requests. Live scheduled_at
 * stays until ops accept. Same-price still requested. Chauffeur is not mailed.
 */
export async function requestCustomerTimeChange(
  env: CloudflareEnv,
  auth: CustomerEditAuth,
  bookingKey: string,
  input: { scheduledLocal: string; scheduledAt?: string },
): Promise<RequestPaidEditResult> {
  const scheduledLocal = input.scheduledLocal.trim();
  if (!scheduledLocal) return { ok: false, code: "not-found" };
  // D-36: the server converts the wall clock; a client-sent instant is ignored.
  const scheduledMs = zurichLocalToUtcMs(scheduledLocal);
  if (scheduledMs == null) return { ok: false, code: "not-found" };
  const scheduledAt = new Date(scheduledMs).toISOString();
  return requestCustomerPaidEdit(env, auth, bookingKey, {
    payload: {
      scheduled_local: scheduledLocal,
      scheduled_at: scheduledAt,
    },
  });
}

export type RefuseEditResult =
  | { ok: true; bookingId: string; requestId: string }
  | EditAcceptFail;

/** D-23 refuse: supersede pending request. Pickup stays original. No apply RPC. */
export async function refuseEditRequest(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<RefuseEditResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  if (!claims.sub) return { ok: false, code: "not-found" };
  try {
    return await asSystem(env, async (sql) => {
      const found = await sql<{ id: string }[]>`
        select id
          from public.bookings
         where erased_at is null
           and (id::text = ${key} or reference = ${key})
         limit 1
      `;
      const bookingId = found[0]?.id;
      if (!bookingId) return { ok: false, code: "not-found" };
      const pending = await sql<{ id: string }[]>`
        select id
          from public.booking_edit_requests
         where booking_id = ${bookingId}::uuid
           and status = 'requested'
         limit 1
      `;
      const requestId = pending[0]?.id;
      if (!requestId) return { ok: false, code: "not-found" };
      await sql`
        update public.booking_edit_requests
           set status = 'superseded'
         where id = ${requestId}::uuid
           and status = 'requested'
      `;
      return { ok: true, bookingId, requestId };
    });
  } catch (err) {
    return mapEditSqlError(err);
  }
}

export async function pendingEditHasTimeChange(
  env: CloudflareEnv,
  bookingKey: string,
): Promise<boolean> {
  const key = bookingKey.trim();
  if (!key) return false;
  try {
    return await asSystem(env, async (sql) => {
      const rows = await sql<{ payload: unknown }[]>`
        select r.payload
          from public.booking_edit_requests r
          join public.bookings b on b.id = r.booking_id
         where r.status = 'requested'
           and b.erased_at is null
           and (b.id::text = ${key} or b.reference = ${key})
         limit 1
      `;
      const payload = rows[0]?.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
      const rec = payload as Record<string, unknown>;
      return typeof rec.scheduled_local === "string" && rec.scheduled_local.trim().length > 0;
    });
  } catch {
    return false;
  }
}

/** D-25 confirm: customer + bookings@ + chauffeur. Refuse: customer only. */
export async function notifyTimeChangeOutcome(
  env: CloudflareEnv,
  bookingId: string,
  outcome: "confirmed" | "refused",
): Promise<void> {
  const id = bookingId.trim();
  if (!id) return;
  type Row = {
    reference: string;
    contact_email: string | null;
    locale: string | null;
    pickup_text: string | null;
    dropoff_text: string | null;
    scheduled_local: string | Date | null;
    chauffeur_email: string | null;
    booking_leg_id: string | null;
  };
  const row = await asSystem(env, async (sql) => {
    const rows = await sql<Row[]>`
      select
        b.reference,
        b.contact_email::text as contact_email,
        b.locale,
        l.pickup_text,
        l.dropoff_text,
        l.scheduled_local,
        l.id::text as booking_leg_id,
        ch.email as chauffeur_email
      from public.bookings b
      join public.booking_legs l
        on l.booking_id = b.id
       and l.leg_seq = 1
      left join public.chauffeurs ch on ch.id = l.assigned_chauffeur_id
      where b.id = ${id}::uuid
      limit 1
    `;
    return rows[0] ?? null;
  });
  if (!row?.contact_email) return;
  const scheduledLocal =
    row.scheduled_local instanceof Date
      ? row.scheduled_local.toISOString()
      : String(row.scheduled_local ?? "");
  const mailOpts = { includeOps: outcome === "confirmed" };
  await notifyTimeChange(env, {
    bookingId: id,
    customerEmail: row.contact_email,
    locale: checkoutLocale(row.locale || "en"),
    reference: row.reference,
    pickupText: row.pickup_text || "",
    dropoffText: row.dropoff_text || "",
    scheduledLocal,
    outcome,
    chauffeurEmail: mailOpts.includeOps ? row.chauffeur_email || undefined : undefined,
    bookingLegId: row.booking_leg_id,
  });
}

export type WriteFlightResult =
  | { ok: true; bookingId: string; flightNo: string }
  | EditAcceptFail;

/** D-27: flight number write-through. No ops confirm. Never AeroDataBox. */
export async function writeCustomerFlightNo(
  env: CloudflareEnv,
  auth: CustomerEditAuth,
  bookingKey: string,
  flightNo: string,
): Promise<WriteFlightResult> {
  const key = bookingKey.trim();
  const no = flightNo.trim().toUpperCase();
  if (!key || !no) return { ok: false, code: "not-found" };
  const owned = await loadOwnedBooking(env, auth, key);
  if (!owned) return { ok: false, code: "not-found" };

  type Trip = {
    booking_id: string;
    reference: string;
    locale: string | null;
    pickup_text: string | null;
    dropoff_text: string | null;
    scheduled_local: string | Date | null;
    chauffeur_email: string | null;
    booking_leg_id: string;
  };

  try {
    const trip = await asSystem(env, async (sql) => {
      const legs = await sql<{ id: string }[]>`
        update public.booking_legs
           set flight_no = ${no}
         where booking_id = ${owned.id}::uuid
           and leg_seq = (
             select min(leg_seq) from public.booking_legs where booking_id = ${owned.id}::uuid
           )
         returning id
      `;
      const legId = legs[0]?.id;
      if (!legId) throw Object.assign(new Error("not-found"), { code: "P0002" });
      const actorKind = auth.kind === "customer" ? "customer" : "guest";
      const actorId = auth.kind === "customer" ? auth.claims.sub : null;
      await sql`
        insert into public.booking_events (
          booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload
        ) values (
          ${owned.id}::uuid,
          ${legId}::uuid,
          ${"booking.modified"},
          ${actorKind},
          ${actorId},
          ${actorKind},
          ${JSON.stringify({ flight_no: no })}::jsonb
        )
      `;
      const rows = await sql<Trip[]>`
        select
          b.id as booking_id,
          b.reference,
          b.locale,
          l.pickup_text,
          l.dropoff_text,
          l.scheduled_local,
          l.id::text as booking_leg_id,
          ch.email as chauffeur_email
        from public.bookings b
        join public.booking_legs l
          on l.booking_id = b.id
         and l.leg_seq = 1
        left join public.chauffeurs ch on ch.id = l.assigned_chauffeur_id
        where b.id = ${owned.id}::uuid
        limit 1
      `;
      return rows[0] ?? null;
    });
    if (!trip) return { ok: false, code: "not-found" };
    const scheduledLocal =
      trip.scheduled_local instanceof Date
        ? trip.scheduled_local.toISOString()
        : String(trip.scheduled_local ?? "");
    await notifyFlightNumber(env, {
      bookingId: trip.booking_id,
      locale: checkoutLocale(trip.locale || "en"),
      reference: trip.reference,
      pickupText: trip.pickup_text || "",
      dropoffText: trip.dropoff_text || "",
      scheduledLocal,
      flightNo: no,
      chauffeurEmail: trip.chauffeur_email,
    });
    return { ok: true, bookingId: owned.id, flightNo: no };
  } catch (err) {
    return mapEditSqlError(err);
  }
}

export type StaffExtraPayOk = { ok: true; bookingId: string; url: string };

/**
 * D-48: the Stripe-hosted URL of the open extra-fare (difference) session of
 * this booking's requested edit. The dashboard opens or copies it. Read-only:
 * no session is created here, and a session that is not open, not kind=extra
 * or has no url answers session-expired.
 */
export async function staffExtraPayUrl(
  env: CloudflareEnv,
  bookingKey: string,
): Promise<StaffExtraPayOk | EditAcceptFail> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  const row = await asSystem(env, async (sql) => {
    const rows = await sql<{ booking_id: string; extra_session_id: string | null }[]>`
      select b.id as booking_id, r.extra_session_id
        from public.bookings b
        left join lateral (
          select er.extra_session_id
            from public.booking_edit_requests er
           where er.booking_id = b.id and er.status = 'requested'
           order by er.created_at desc
           limit 1
        ) r on true
       where b.erased_at is null
         and (b.id::text = ${key} or b.reference = ${key})
       limit 1
    `;
    return rows[0] ?? null;
  });
  if (!row) return { ok: false, code: "not-found" };
  if (!row.extra_session_id) return { ok: false, code: "no-session" };
  const stored = await retrieveCheckoutSession(stripeFromEnv(env), row.extra_session_id).catch(
    () => null,
  );
  if (
    !stored ||
    !stored.url ||
    stored.status !== "open" ||
    stored.metadata?.kind !== "extra" ||
    stored.metadata?.booking_id !== String(row.booking_id)
  ) {
    return { ok: false, code: "session-expired" };
  }
  return { ok: true, bookingId: String(row.booking_id), url: stored.url };
}
