// apps/web/lib/ops/edit-request.ts
//
// 08-07: paid-edit request + ops accept. Extra Checkout Session is the
// fare difference only (D-67). Merge supersedes the previous requested row
// and expires the old extra session when the amount changed (D-73).
// 26.2 P1: accept answers applied, refund_due or extra_required. A cheaper change is "Refund due"
// for the admin's Refund click (refunds by hand): nothing goes to Stripe from here except the
// Stripe page for a difference to pay. Accept needs the request id of a stored request: no
// change is built from fields the browser sends. Never asStaff INSERT payments. Hyperdrive
// DIRECT only.

export const dynamic = "force-dynamic";

import type { VamosClaims } from "@/lib/db/identity";
import { asCustomer, asGuest, asSystem } from "@/lib/db/identity";
import {
  loadEditBookingContact,
  loadEditExtraSession,
  loadEditPendingPayload,
  loadEditSnapshotTotal,
  loadTripForMail,
  supersedePendingEditRequest,
  writeFlightNumber,
} from "@/lib/db/system-reads";
import { notifyFlightNumber, notifyTimeChange } from "@/lib/lifecycle/notify-lifecycle";
import {
  createCheckoutSession,
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
import { lockSecretPresent } from "../quote/lock-secret";
import { deliverOverlapMustFix } from "./must-fix-mail";

export type { AcceptOutcome, EditPayload } from "./edit-request-map";
export { extraCheckoutMetadata, fareDifferenceRappen, mapEditSqlError, shouldExpireOldExtraSession };

export const DASHBOARD_ORIGIN = "https://dashboard.vamostaxi.site";

export type EditAcceptOk = {
  ok: true;
  outcome: "applied" | "extra_required" | "refund_due";
  requestId: string;
  bookingId: string;
  differenceRappen: number;
  extraSessionId: string | null;
};

export type EditAcceptResult = EditAcceptOk | EditAcceptFail;

export type AcceptPaidEditInput = {
  payload: EditPayload;
  requestId?: string;
  /** Kept for the F14 guard only: a lock is not read by accept any more (26.2 P1). */
  lock?: string;
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

export type DifferencePaymentOk = { ok: true; sessionId: string; url: string | null };

/**
 * The Stripe page for the difference of a requested change (D-67, D-48: Stripe's hosted page).
 * Reuses the open page of the request it replaced when the amount is the same, else expires it;
 * opens 24 h; stores the page id on the request. 26.2 P1 calls this after the admin's dearer
 * class change; the dashboard's Accept calls it for a customer request.
 */
export async function openDifferencePayment(
  env: CloudflareEnv,
  args: {
    requestId: string;
    bookingId: string;
    differenceRappen: number;
    oldSessionId: string | null;
    oldExtraSnapshotId: number | null;
    dashboardOrigin: string;
  },
): Promise<DifferencePaymentOk | EditAcceptFail> {
  const difference = fareDifferenceRappen(args.differenceRappen, 0);
  if (difference <= 0) return { ok: false, code: "unknown" };

  const stripe = stripeFromEnv(env);
  let reuse: { id: string; url: string | null } | null = null;
  const oldSessionId = args.oldSessionId;
  let oldExtraTotal: number | null = null;
  if (args.oldExtraSnapshotId != null) {
    oldExtraTotal = await loadEditSnapshotTotal(env, args.oldExtraSnapshotId);
  }

  if (oldSessionId && !shouldExpireOldExtraSession(oldExtraTotal, difference)) {
    try {
      const existing = await retrieveCheckoutSession(stripe, oldSessionId);
      if (hostedSessionIsPayable(existing, difference)) {
        reuse = { id: oldSessionId, url: existing?.url ?? null };
      }
    } catch {
      reuse = null;
    }
  }

  if (oldSessionId && reuse?.id !== oldSessionId) {
    try {
      await expireCheckoutSession(stripe, oldSessionId);
    } catch {
      // Already expired / consumed — merge still proceeds with one extra payment.
    }
  }

  let session = reuse;
  if (!session) {
    const booking = await loadEditBookingContact(env, args.bookingId);
    if (!booking) return { ok: false, code: "not-found" };
    const email = String(booking.contact_email ?? "").trim();
    if (!email) return { ok: false, code: "not-found" };
    const reference = String(booking.reference);
    const locale = checkoutLocale(String(booking.locale ?? "en"));
    const meta = extraCheckoutMetadata(args.bookingId, args.requestId);
    try {
      const created = await createCheckoutSession(stripe, {
        chargedRappen: difference,
        bookingId: meta.booking_id,
        bookingReference: reference,
        customerEmail: email,
        locale,
        idempotencyKey: `extra:${args.requestId}:${difference}`,
        // D4 (owner, 2026-09-30): the difference can be paid for 24 hours.
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        // D-48: Stripe's hosted page, no card form of ours. Paid returns through
        // the settle route to the confirmation; Back returns to the ops booking.
        uiMode: "hosted_page",
        successUrl: stripeCheckoutReturnUrl(PUBLIC_SITE_ORIGIN, locale),
        cancelUrl: `${args.dashboardOrigin.replace(/\/$/, "")}/bookings/${encodeURIComponent(reference)}`,
        productName: "Fare difference",
        extra: { extraId: meta.extra_id },
      });
      session = { id: created.id, url: created.url ?? null };
    } catch {
      return { ok: false, code: "stripe-failed" };
    }
  }

  try {
    await asSystem(env, async (sql) => {
      await sql`
        select public.booking_edit_request_set_extra_session(
          ${args.requestId}::uuid,
          ${session.id}::text
        )
      `;
    });
  } catch (err) {
    return mapEditSqlError(err);
  }

  return { ok: true, sessionId: session.id, url: session.url };
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

  // F14: a lock token is checked against the secret; an empty secret is refused up front.
  if ((input.lock ?? "").trim() && !lockSecretPresent(env.QUOTE_LOCK_SECRET, "edit-request/accept")) {
    return { ok: false, code: "temporarily_unavailable" };
  }

  // 26.2 P1 (lead note 3): only a stored request is accepted. A change the admin makes himself
  // goes through the class-change route (lib/ops/booking-change.ts), priced on the server.
  const requestId = (input.requestId ?? "").trim();
  if (!requestId) return { ok: false, code: "invalid-body" };

  const secret = env.STRIPE_SECRET_KEY ?? "";
  if (secret.startsWith("sk_live_")) {
    return { ok: false, code: "stripe-test-only" };
  }

  type AcceptRow = {
    request_id: string;
    booking_id: string;
    outcome: string;
    difference_rappen: number;
    extra_snapshot_id: number | null;
    extra_session_id: string | null;
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

  if (accepted.outcome === "applied" || accepted.outcome === "refund_due") {
    return {
      ok: true,
      outcome: accepted.outcome,
      requestId: accepted.request_id,
      bookingId: accepted.booking_id,
      differenceRappen: accepted.difference_rappen,
      extraSessionId: null,
    };
  }

  if (accepted.outcome !== "extra_required") {
    return { ok: false, code: "unknown" };
  }

  const opened = await openDifferencePayment(env, {
    requestId: accepted.request_id,
    bookingId: accepted.booking_id,
    differenceRappen: accepted.difference_rappen,
    oldSessionId: accepted.extra_session_id,
    oldExtraSnapshotId: null,
    dashboardOrigin,
  });
  if (!opened.ok) return opened;

  return {
    ok: true,
    outcome: "extra_required",
    requestId: accepted.request_id,
    bookingId: accepted.booking_id,
    differenceRappen: fareDifferenceRappen(accepted.difference_rappen, 0),
    extraSessionId: opened.sessionId,
  };
}

async function loadOwnedBooking(
  env: CloudflareEnv,
  auth: CustomerEditAuth,
  key: string,
): Promise<OwnedBooking | null> {
  // 26.2 P6: only columns both customer roles may read (their column grants leave out erased_at,
  // so filtering on it refused every call with 42501). A staff-erased booking is refused by the
  // definer writes themselves (the request upsert checks erased_at).
  const query = async (
    sql: Parameters<Parameters<typeof asSystem>[1]>[0],
  ): Promise<OwnedBooking | null> => {
    const rows = await sql<OwnedBooking[]>`
      select b.id
        from public.bookings b
       where b.id::text = ${key} or b.reference = ${key}
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

  if ((input.lock ?? "").trim() && !lockSecretPresent(env.QUOTE_LOCK_SECRET, "edit-request/customer")) {
    return { ok: false, code: "temporarily_unavailable" };
  }

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
          const current = env.QUOTE_LOCK_SECRET ?? "";
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

      // 26.2 P1: a JSON parameter, not `JSON.stringify(...)::jsonb` — through the Worker's client
      // that text arrives as a JSON string and the payload check refused every request (23514).
      const rows = await sql<UpsertRow[]>`
        select * from public.booking_edit_request_upsert(
          ${owned.id}::uuid,
          'customer',
          ${actorId}::uuid,
          ${sql.json(input.payload as Parameters<typeof sql.json>[0])},
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
    const done = await supersedePendingEditRequest(env, key);
    if (!done) return { ok: false, code: "not-found" };
    return { ok: true, bookingId: done.booking_id, requestId: done.request_id };
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
    const payload = await loadEditPendingPayload(env, key);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const rec = payload as Record<string, unknown>;
    return typeof rec.scheduled_local === "string" && rec.scheduled_local.trim().length > 0;
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
  const row = await loadTripForMail(env, id);
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

  try {
    const trip = await writeFlightNumber(env, {
      bookingId: owned.id,
      flightNo: no,
      actorKind: auth.kind === "customer" ? "customer" : "guest",
      actorId: auth.kind === "customer" ? auth.claims.sub : null,
    });
    if (!trip) return { ok: false, code: "not-found" };
    const scheduledLocal =
      trip.scheduled_local instanceof Date
        ? trip.scheduled_local.toISOString()
        : String(trip.scheduled_local ?? "");
    // The flight number is saved before the notice goes out; a notice that fails must not turn a
    // saved number into "Could not save" on the page. Found 2026-10-01 (P6, D19): the mail ledger's
    // kind list (booking_notifications_kind_check) still refuses 'flight_no' (open since 09-06), so
    // the claim raises 23514 on every save.
    try {
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
    } catch (err) {
      console.error("writeCustomerFlightNo notice", owned.id, err instanceof Error ? err.message : String(err));
    }
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
  const row = await loadEditExtraSession(env, key);
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
