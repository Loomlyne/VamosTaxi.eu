// apps/web/lib/ops/edit-request.ts
//
// 08-07: paid-edit request + ops accept. Extra Checkout Session is the
// fare difference only (D-67). Merge supersedes the previous requested row
// and expires the old extra session (D-73; since 261002 always: one page, one request).
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

/**
 * P6 review 1 (2026-10-02): what a customer may ask for — a new time (D9). Nothing else comes from the
 * browser: no quote lock, no price record, no place, party or contact (the database refuses them too).
 */
type CustomerTimePayload = { scheduled_local: string; scheduled_at: string };

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

type StripeClient = ReturnType<typeof stripeFromEnv>;

/** Best effort: closes a Stripe page. A page already paid or expired is left as it is. */
async function closePage(stripe: StripeClient, sessionId: string): Promise<void> {
  try {
    await expireCheckoutSession(stripe, sessionId);
  } catch {
    // Already expired or paid: a payment that still arrives is recorded (P1 C6).
  }
}

/**
 * The Stripe page for the difference of a requested change (D-67, D-48: Stripe's hosted page).
 * One page belongs to one request (261002, review of item 4, finding 1): the settle finds its
 * request by page id, so a page shared with an ended request would record the payment on that
 * one and leave the change waiting. So:
 *   - `ownSessionId`: the page already stored on THIS request (the dashboard's Accept of the same
 *     request again). Reused while it is open for the same amount, else closed and replaced (the
 *     replacement's Stripe key names the page it replaces). If Stripe cannot read it: stripe-failed,
 *     and the page is left as it is.
 *   - `supersededSessionId`: the page of the request this one replaced (the dashboard's class and
 *     trip changes). Never reused: always closed (best effort), and a new page is opened.
 * Opens 24 h; stores the page id on the request. 26.2 P1 calls this after the admin's dearer class
 * change, P6 after a dearer trip change; the dashboard's Accept calls it for a customer request.
 */
export async function openDifferencePayment(
  env: CloudflareEnv,
  args: {
    requestId: string;
    bookingId: string;
    differenceRappen: number;
    ownSessionId?: string | null;
    supersededSessionId?: string | null;
    dashboardOrigin: string;
  },
): Promise<DifferencePaymentOk | EditAcceptFail> {
  const difference = fareDifferenceRappen(args.differenceRappen, 0);
  if (difference <= 0) return { ok: false, code: "unknown" };

  const stripe = stripeFromEnv(env);
  let reuse: { id: string; url: string | null } | null = null;
  const ownSessionId = (args.ownSessionId ?? "").trim();
  const supersededSessionId = (args.supersededSessionId ?? "").trim();

  if (ownSessionId) {
    // 261002 review round 2, warning 2: a page we cannot read is left alone (it may still be good;
    // closing it would end the request through its expired event). The owner tries again.
    let existing: Awaited<ReturnType<typeof retrieveCheckoutSession>>;
    try {
      existing = await retrieveCheckoutSession(stripe, ownSessionId);
    } catch {
      return { ok: false, code: "stripe-failed" };
    }
    if (hostedSessionIsPayable(existing, difference)) {
      reuse = { id: ownSessionId, url: existing?.url ?? null };
    } else {
      await closePage(stripe, ownSessionId);
    }
  }

  if (supersededSessionId && supersededSessionId !== reuse?.id) {
    await closePage(stripe, supersededSessionId);
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
        // The page it replaces is part of the key (review round 2, warning 2): a replacement page for
        // the same request and amount is a new Stripe request, not a replay of the first one (Stripe
        // refuses a replayed key whose parameters differ). Retries of the same state stay idempotent.
        idempotencyKey: `extra:${args.requestId}:${difference}:${ownSessionId || "0"}`,
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
    // The page this same request already has (a second Accept): reused while it is still payable.
    ownSessionId: accepted.extra_session_id,
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
/**
 * Customer/guest time-change request. Writes `booking_edit_requests` `requested`, priced at the
 * booking's own total (its price record cloned at its own total): a time change keeps the price paid
 * (D1). Does not mutate booking columns. Identity is JWT email (asCustomer) or manage token (asGuest);
 * the upsert is asSystem. Never asStaff from this door.
 */
async function requestCustomerTime(
  env: CloudflareEnv,
  auth: CustomerEditAuth,
  bookingKey: string,
  payload: CustomerTimePayload,
): Promise<RequestPaidEditResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  const owned = await loadOwnedBooking(env, auth, key);
  if (!owned) return { ok: false, code: "not-found" };

  const actorId = auth.kind === "customer" ? auth.claims.sub : null;

  try {
    const upsert = await asSystem(env, async (sql) => {
      // The booking's own record at its own total (the function returns the bound record when it can).
      const cloned = await sql<{ id: number }[]>`
        select public.booking_edit_clone_quote_snapshot(
          ${owned.id}::uuid,
          ${null}::rappen,
          ${null}::uuid
        ) as id
      `;
      const quoteSnapshotId = Number(cloned[0]?.id ?? 0);
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
          ${sql.json(payload as Parameters<typeof sql.json>[0])},
          ${quoteSnapshotId}::bigint
        )
      `;
      const row = rows[0];
      if (!row) throw Object.assign(new Error("not-found"), { code: "P0002" });
      return {
        request_id: String(row.request_id),
        old_extra_session_id: row.old_extra_session_id ? String(row.old_extra_session_id) : "",
      };
    });
    // 261002 (review of item 4, finding 3): the request this one replaced may still have a page for a
    // difference (only once its price record expired, so the page is normally dead already). Closed
    // best effort, as the dashboard's changes do; a failure never fails the customer's request.
    if (upsert.old_extra_session_id) {
      try {
        await closePage(stripeFromEnv(env), upsert.old_extra_session_id);
      } catch {
        // No Stripe key here: the page ends by itself.
      }
    }
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
  return requestCustomerTime(env, auth, bookingKey, {
    scheduled_local: scheduledLocal,
    scheduled_at: scheduledAt,
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
