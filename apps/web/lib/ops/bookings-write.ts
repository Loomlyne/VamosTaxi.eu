// apps/web/lib/ops/bookings-write.ts
//
// Staff cancel, delete, and in-place field updates. Refund is lib/ops/refund.ts
// (by hand, 20-10: a cancel never calls Stripe). Board `id` is the public reference; bookingId is the uuid.
// DATA-08: ops_cancel_booking writes booking_events (booking.status_changed) in the same tx.

import { chauffeurEmailLocale, sendFlightNumber } from "@vamos/emails/confirmation";
import { mintManageToken } from "@/lib/checkout/manage-token";
import { asStaff, asSystem, type VamosClaims } from "@/lib/db/identity";
import { expireSessionIds } from "../checkout/cancel-unpaid";
import { stripeAccountIsLegacyUaeTest } from "../checkout/charge-gate";
import { expireCheckoutSession, stripeFromEnv } from "../checkout/stripe";
import { finishPaidCancel } from "../lifecycle/paid-cancel";
import { mapRefundSqlError, sqlErrorCode } from "./refund-map";
import { resolveStaffBookingId } from "./resolve-booking-id";
import { OPS_SQLSTATE } from "./sqlstate";

export const dynamic = "force-dynamic";

export type CancelledBooking = {
  id: string;
  reference: string;
  email: string;
  name: string;
  locale: string;
  paid: boolean;
};

/**
 * 26.2 P6 (D6, D8): what the in-place save of a paid booking may still change. Places, date, time,
 * passengers, bags and class are priced and confirmed through …/change (booking-trip-change.ts).
 */
export type BookingPatch = {
  customer?: string;
  email?: string;
  phone?: string;
  note?: string;
  flight?: string;
};


export type CancelResult =
  | { ok: true; booking: CancelledBooking; erased?: boolean }
  | { ok: false; code: "not-found" | "frozen" | "unknown" };

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 261001-refusal-messages: the SQL error of ops_cancel_booking / ops_mark_complete /
 * ops_mark_no_show as the staff refusal the dashboard shows. Call it AROUND asSystem, never
 * inside its callback: postgres.js begin() rethrows a query error the callback caught
 * (postgres@3.4.9 cf/src/index.js 266-267, 293), so a catch inside let the refusal leave as a
 * 500 without JSON and the page showed its generic "Could not …" text.
 */
function mapOutcomeSqlError(
  err: unknown,
  what: string,
  bookingId: string,
): { ok: false; code: "not-found" | "frozen" | "unknown" } {
  if (sqlErrorCode(err) === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  if (mapRefundSqlError(err).code === "frozen") return { ok: false, code: "frozen" };
  // Not a named refusal: keep a trace (the throw used to be the only one), answer "unknown".
  console.error(
    what,
    bookingId,
    sqlErrorCode(err) ?? "",
    err instanceof Error ? err.message : String(err),
  );
  return { ok: false, code: "unknown" };
}

export async function cancelBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<CancelResult> {
  const key = id.trim();
  if (!key) return { ok: false, code: "not-found" };
  const bookingId = BOOKING_UUID.test(key)
    ? key
    : await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };

  const captured = await asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: number }[]>`
      select 1 as id
        from public.booking_payments as p
       where p.booking_id = ${bookingId}::uuid
         and p.captured_at is not null
       limit 1
    `;
    return rows.length > 0;
  });
  if (!captured) {
    const erased = await eraseBooking(env, claims, bookingId);
    if (!erased) return { ok: false, code: "not-found" };
    // 26.2-bp B1: the erase leaves the booking pending, so a Stripe Checkout
    // Session the customer still has open stayed payable and settle would
    // confirm a booking the board no longer lists. Expire them here, same
    // guard as the paid path below. A failure is logged; the erase stands.
    const unpaidPublishable = env.STRIPE_PUBLISHABLE_KEY || "";
    const canExpireUnpaid =
      Boolean(unpaidPublishable) && !stripeAccountIsLegacyUaeTest(unpaidPublishable);
    if (canExpireUnpaid) {
      try {
        const sessionIds = await asSystem(env, async (sql) => {
          const rows = await sql<{ ids: string[] | null }[]>`
            select public.checkout_booking_session_ids(${bookingId}::uuid) as ids
          `;
          return rows[0]?.ids ?? [];
        });
        const stripeForUnpaid = stripeFromEnv(env);
        await expireSessionIds(
          {
            expireSession: (sessionId) =>
              expireCheckoutSession(stripeForUnpaid, sessionId).then(() => undefined),
            canExpire: true,
            emit: (message, sessionId, err) => {
              console.error(message, sessionId, err instanceof Error ? err.message : String(err));
            },
          },
          sessionIds,
        );
      } catch (err) {
        console.error(
          "ops_unpaid_cancel_session_read_failed",
          bookingId,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return {
      ok: true,
      erased: true,
      booking: {
        id: bookingId,
        reference: key,
        email: "",
        name: "",
        locale: "en",
        paid: false,
      },
    };
  }

  type CancelRow = {
    booking_id: string;
    reference: string;
    email: string;
    name: string;
    locale: string;
    paid: boolean;
    refund_mode: string | null;
    refund_rappen: number | string | null;
    stripe_checkout_session_ids: string[] | null;
  };

  // 261001-refusal-messages: the refusal is mapped around asSystem (see mapOutcomeSqlError).
  let cancelled: CancelResult | CancelRow;
  try {
    cancelled = await asSystem(env, async (sql): Promise<CancelResult | CancelRow> => {
      const rows = await sql<CancelRow[]>`
        select * from public.ops_cancel_booking(
          ${bookingId}::uuid,
          ${claims.sub}::uuid
        )
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      return row;
    });
  } catch (err) {
    cancelled = mapOutcomeSqlError(err, "ops_cancel_sql_failed", bookingId);
  }

  if ("ok" in cancelled && cancelled.ok === false) return cancelled;
  const row = cancelled as CancelRow;

  // D-04: expire every open Stripe Checkout Session this booking still has,
  // after the cancel above already committed. A Stripe failure is logged;
  // the cancel stands regardless (same guard as account cancel/abandon —
  // the legacy UAE test account's sessions are never touched, D-01).
  const publishable = env.STRIPE_PUBLISHABLE_KEY || "";
  const canExpireSessions = Boolean(publishable) && !stripeAccountIsLegacyUaeTest(publishable);
  const stripeForExpiry = canExpireSessions ? stripeFromEnv(env) : null;
  await expireSessionIds(
    {
      expireSession: (sessionId) =>
        stripeForExpiry
          ? expireCheckoutSession(stripeForExpiry, sessionId).then(() => undefined)
          : Promise.resolve(),
      canExpire: canExpireSessions,
      emit: (message, sessionId, err) => {
        console.error(message, sessionId, err instanceof Error ? err.message : String(err));
      },
    },
    row.stripe_checkout_session_ids ?? [],
  );

  // 20-10 refunds by hand: no Stripe call on a staff cancel. The booking keeps "Refund due"
  // (pending_ops; the owed amount for a cancel more than 24 h ahead) and the customer gets the
  // normal cancellation mail at once, with the approved refund sentence. The admin sends the
  // refund from the dashboard. The mail is best-effort; the cancel already committed.
  // Only a PAID booking gets this mail; an unpaid cancel has no refund sentence to send.
  if (row.paid === true) {
    await finishPaidCancel(env, {
      booking_id: String(row.booking_id),
      refund_mode: String(row.refund_mode ?? ""),
      refund_rappen: row.refund_rappen,
      stripe_payment_intent_id: null,
    });
  }

  return {
    ok: true,
    booking: {
      id: String(row.booking_id),
      reference: String(row.reference),
      email: String(row.email ?? ""),
      name: String(row.name ?? ""),
      locale: String(row.locale ?? "en"),
      paid: Boolean(row.paid),
    },
  };
}

export type UpdateResult =
  | { ok: true }
  | { ok: false; code: "not-found" | "unpaid" };

export type ContactUpdateResult =
  | { ok: true; changed: string[]; flightChanged: boolean; driverMailed: boolean }
  | { ok: false; code: "not-found" | "unpaid" | "unknown" };

type ContactUpdateRow = {
  booking_id: string;
  changed_fields: string | null;
  flight_changed: boolean;
  assigned_chauffeur_id: string | null;
};

/**
 * 26.2 P6 (D6, D8): name, e-mail, phone, note and flight number of a PAID booking, saved at once
 * with no new price through booking_staff_contact_update (one booking.modified event names what
 * changed). An emptied name, e-mail or phone keeps the stored value; no other field is written.
 * A new flight number: the driver on the trip gets the existing flight-number e-mail (best effort).
 * The refusal is mapped AROUND asSystem (postgres.js begin() rethrows).
 */
export async function updateBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  patch: BookingPatch,
): Promise<ContactUpdateResult> {
  const key = id.trim();
  if (!key) return { ok: false, code: "not-found" };
  const bookingId = await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };
  let row: ContactUpdateRow | null;
  try {
    row = await asSystem(env, async (sql) => {
      const rows = await sql<ContactUpdateRow[]>`
        select * from public.booking_staff_contact_update(
          ${bookingId}::uuid,
          ${claims.sub}::uuid,
          ${patch.customer ?? null}::text,
          ${patch.email ?? null}::text,
          ${patch.phone ?? null}::text,
          ${patch.note ?? null}::text,
          ${patch.flight ?? null}::text
        )
      `;
      return rows[0] ?? null;
    });
  } catch (err) {
    if (sqlErrorCode(err) === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
    const message = err instanceof Error ? err.message : "";
    if (message === "unpaid") return { ok: false, code: "unpaid" };
    console.error("updateBooking", bookingId, sqlErrorCode(err) ?? "", message);
    return { ok: false, code: "unknown" };
  }
  if (!row) return { ok: false, code: "not-found" };
  const changed = String(row.changed_fields ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  const flightNo = String(patch.flight ?? "").trim().toUpperCase();
  let driverMailed = false;
  if (row.flight_changed && flightNo && row.assigned_chauffeur_id) {
    driverMailed = await mailDriverFlight(env, bookingId, String(row.assigned_chauffeur_id), flightNo);
  }
  return { ok: true, changed, flightChanged: row.flight_changed === true, driverMailed };
}

/** D8: the existing flight-number e-mail to the driver on the trip, in his language. */
async function mailDriverFlight(env: CloudflareEnv, bookingId: string, chauffeurId: string, flightNo: string): Promise<boolean> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) return false;
  try {
    const facts = await asSystem(env, async (sql) => {
      const rows = await sql<
        { email: string | null; languages_csv: string | null; reference: string; pickup_text: string | null; dropoff_text: string | null; scheduled_local: string | null }[]
      >`select * from public.booking_change_mail_facts(${bookingId}::uuid, ${chauffeurId}::uuid)`;
      return rows[0] ?? null;
    });
    const to = String(facts?.email ?? "").trim();
    if (!facts || !to) return false;
    const sent = await sendFlightNumber(
      { RESEND_API_KEY: key },
      {
        reference: String(facts.reference),
        locale: chauffeurEmailLocale(String(facts.languages_csv ?? "").split(",").map((x) => x.trim()).filter(Boolean)),
        pickupText: String(facts.pickup_text ?? ""),
        dropoffText: String(facts.dropoff_text ?? ""),
        scheduledLocal: String(facts.scheduled_local ?? ""),
        flightNo,
      },
      to,
    );
    return sent.ok;
  } catch {
    // The flight number is saved either way; the driver sees it on the next mail.
    return false;
  }
}

export async function markArrival(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<UpdateResult> {
  const key = id.trim();
  if (!key) return { ok: false, code: "not-found" };
  return asStaff(env, claims, async (sql) => {
    const found = await sql<{ id: string }[]>`
      select id from public.bookings
      where erased_at is null and (id::text = ${key} or reference = ${key})
      limit 1
    `;
    const bookingId = found[0]?.id;
    if (!bookingId) return { ok: false, code: "not-found" };
    await sql`
      update public.booking_legs
      set
        arrived_at = coalesce(arrived_at, now()),
        updated_at = now()
      where booking_id = ${bookingId}::uuid
        and leg_seq = (
          select min(leg_seq) from public.booking_legs where booking_id = ${bookingId}::uuid
        )
    `;
    return { ok: true };
  });
}

export async function eraseBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<boolean> {
  const key = id.trim();
  if (!key) return false;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      update public.bookings
      set erased_at = now(), updated_at = now()
      where erased_at is null
        and (id::text = ${key} or reference = ${key})
      returning id
    `;
    return rows.length > 0;
  });
}

export type MarkedBooking = {
  bookingId: string;
  reference: string;
  email: string;
  name: string;
  locale: string;
  paid: boolean;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  token: string;
};

export type MarkResult =
  | { ok: true; booking: MarkedBooking }
  | { ok: false; code: "not-found" | "frozen" | "unknown" };

type MarkRow = {
  booking_id: string;
  reference: string;
  email: string;
  name: string;
  locale: string;
  paid: boolean;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
};

function tokenHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function markedFrom(row: MarkRow, token: string): MarkedBooking {
  return {
    bookingId: String(row.booking_id),
    reference: String(row.reference ?? ""),
    email: String(row.email ?? ""),
    name: String(row.name ?? ""),
    locale: String(row.locale ?? "en"),
    paid: row.paid === true,
    pickupText: String(row.pickup_text ?? ""),
    dropoffText: String(row.dropoff_text ?? ""),
    scheduledLocal: String(row.scheduled_local ?? ""),
    token,
  };
}

async function markOutcome(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  rpc: "ops_mark_complete" | "ops_mark_no_show",
): Promise<MarkResult> {
  const key = id.trim();
  if (!key) return { ok: false, code: "not-found" };
  const bookingId = BOOKING_UUID.test(key)
    ? key
    : await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };

  const minted = await mintManageToken();
  const hex = tokenHex(minted.hash);

  // 261001-refusal-messages: the refusal is mapped around asSystem (see mapOutcomeSqlError).
  let marked: MarkResult | MarkRow;
  try {
    marked = await asSystem(env, async (sql): Promise<MarkResult | MarkRow> => {
      const rows =
        rpc === "ops_mark_complete"
          ? await sql<MarkRow[]>`
              select * from public.ops_mark_complete(
                ${bookingId}::uuid,
                ${claims.sub}::uuid,
                decode(${hex}, 'hex')
              )
            `
          : await sql<MarkRow[]>`
              select * from public.ops_mark_no_show(
                ${bookingId}::uuid,
                ${claims.sub}::uuid,
                decode(${hex}, 'hex')
              )
            `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      return row;
    });
  } catch (err) {
    marked = mapOutcomeSqlError(err, `${rpc}_sql_failed`, bookingId);
  }

  if ("ok" in marked && marked.ok === false) return marked;
  return { ok: true, booking: markedFrom(marked as MarkRow, minted.raw) };
}

export function markComplete(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<MarkResult> {
  return markOutcome(env, claims, id, "ops_mark_complete");
}

export function markNoShow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<MarkResult> {
  return markOutcome(env, claims, id, "ops_mark_no_show");
}
