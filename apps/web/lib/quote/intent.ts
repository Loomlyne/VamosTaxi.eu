// apps/web/lib/quote/intent.ts
//
// 04-API-CONTRACT.md §6 — quote-side refusal ladder for POST /api/checkout/intent.
// Phase 7 writes the route. This module answers one question: may this lock
// become a booking. D-05, D-25, D-49, D-57.
//
// Negative space: this module creates no PaymentIntent, opens no transaction,
// writes no row, mints no booking reference and builds no Response. Phase 7
// decides HTTP.
//
// Phase 7 inherits and must not re-decide:
//  - manage-link validity is thirty days after the last leg (D-44, ADR-014 §5, U5)
//  - payment window is checkout_window_minutes from the settings version, written
//    once and never extended (D-23/D-43)
//  - flight_checked_at and flight_time_source are written FROM the lock (D-20)
//  - coupon consumption happens at PaymentIntent creation under SELECT … FOR UPDATE
//    (D-30), not here
//
// D-57: idempotency_key is required, forwarded and NOT interpreted. Deriving it
// from quote_id would settle U20 by accident; U20 is Phase 7's.

import type { QuoteErrorCode } from "./errors";
import {
  verifyLock,
  type LockSecrets,
  type QuoteLockPayload,
} from "./lock";

/** Seconds in one minute — duration_s → estimated minutes. Not a waiting figure. */
const SECONDS_PER_MINUTE = 60;

export const INTENT_LADDER = Object.freeze([
  Object.freeze({ id: "verify_hmac" as const }),
  Object.freeze({
    id: "worker_expires" as const,
    // Fast local refusal saves a round trip. A Worker clock is not the
    // authority — deleting this step must not change any outcome (D-49).
    decorative: true as const,
  }),
  Object.freeze({
    id: "postgres_exp" as const,
    // Worker-side mirror of create_quote_snapshot's restrict_violation
    // (plan 04-15). The database raise is the real gate; this check is the
    // polite one. Do not "simplify" by deleting the SQL half.
  }),
  Object.freeze({
    id: "pricing_live" as const,
    // Refuse on EITHER pricing_live false OR a null chosen-class total.
    // The flag answers "is there a live matrix"; the null answers "did this
    // class price". A board can fail the second while passing the first.
  }),
  Object.freeze({
    id: "recompute_pin" as const,
    // D-27: compare against the PIN (extras + coupon already inside the lock),
    // not against a fresh quote. A legitimate coupon applied at reprice must
    // not read as a price change.
  }),
]);

export type IntentStepId = (typeof INTENT_LADDER)[number]["id"];

export type IntentVehicleClass = "economy" | "business" | "first" | "van";

export type IntentBody = {
  quote_id: string;
  lock: string;
  vehicle_class: IntentVehicleClass;
  extras?: QuoteLockPayload["extras"];
  coupon?: string | null;
  flight_no?: string | null;
  landing_source?: string | null;
  pax?: number;
  /** Required. Forwarded. Never hashed or derived from quote_id (D-57). */
  idempotency_key: string;
};

export type IntentRecomputeClass = {
  slug: IntentVehicleClass;
  total_rappen: number | null;
  eligible: boolean;
};

export type IntentRecompute = {
  pricing_live: boolean;
  engine_version: string;
  classes: IntentRecomputeClass[];
};

export type CheckIntentDeps = {
  secrets: LockSecrets;
  workerNowIso: string;
  postgresNowIso: string;
  recompute: (payload: QuoteLockPayload) => IntentRecompute;
};

export type IntentOk = {
  ok: true;
  payload: QuoteLockPayload;
  idempotency_key: string;
};

export type IntentErr = {
  ok: false;
  code: QuoteErrorCode;
};

export type IntentResult = IntentOk | IntentErr;

const NOT_FOUND: IntentErr = { ok: false, code: "quote_not_found" };

function refuse(code: QuoteErrorCode): IntentErr {
  return { ok: false, code };
}

function estimatedMinutes(payload: QuoteLockPayload): number {
  let seconds = 0;
  for (const leg of payload.legs) {
    seconds += leg.duration_s;
  }
  return Math.round(seconds / SECONDS_PER_MINUTE);
}

function flightDisagrees(body: IntentBody, payload: QuoteLockPayload): boolean {
  if (body.flight_no === undefined && body.landing_source === undefined) {
    return false;
  }
  const first = payload.legs[0];
  if (!first) return true;
  if (body.flight_no !== undefined && body.flight_no !== first.flight_no) {
    return true;
  }
  if (
    body.landing_source !== undefined &&
    body.landing_source !== first.landing_source
  ) {
    return true;
  }
  return false;
}

/**
 * May this lock become a booking? Values only — Phase 7 maps to HTTP.
 *
 * `ladder` defaults to INTENT_LADDER. Tests pass a copy with the decorative
 * step removed to prove deleting it changes nothing.
 */
export async function checkIntentAgainstLock(
  body: IntentBody,
  deps: CheckIntentDeps,
  ladder: readonly (typeof INTENT_LADDER)[number][] = INTENT_LADDER,
): Promise<IntentResult> {
  const ids = new Set(ladder.map((step) => step.id));

  // HMAC only. verifyLock's clock check is decorative; steps 2/3 own expiry.
  const verified = await verifyLock(deps.secrets, body.lock, "0001-01-01T00:00:00.000Z");
  if (!verified.ok && verified.reason === "invalid") {
    return NOT_FOUND;
  }
  const payload = verified.payload;
  if (!payload || payload.quote_id !== body.quote_id) {
    return NOT_FOUND;
  }

  if (ids.has("worker_expires") && payload.exp <= deps.workerNowIso) {
    return refuse("quote_expired");
  }

  // D-49: postgresNowIso is either now() inside the write transaction (frozen
  // clock) or a single-select deadline passed forward (fallback). This module
  // does not open the transaction.
  if (ids.has("postgres_exp") && payload.exp <= deps.postgresNowIso) {
    return refuse("quote_expired");
  }

  if (typeof body.pax === "number" && body.pax < 1) {
    return refuse("untrusted_input");
  }

  if (estimatedMinutes(payload) < 1) {
    return refuse("untrusted_input");
  }

  if (flightDisagrees(body, payload)) {
    return refuse("untrusted_input");
  }

  const board = deps.recompute(payload);
  const chosen = board.classes.find((row) => row.slug === body.vehicle_class);

  if (ids.has("pricing_live")) {
    if (!board.pricing_live || chosen?.total_rappen == null) {
      return refuse("pricing_not_live");
    }
  }

  if (!chosen || chosen.eligible === false) {
    return refuse("untrusted_input");
  }

  if (ids.has("recompute_pin")) {
    const pinned = payload.class_totals.find(
      (row) => row.slug === body.vehicle_class,
    );
    if (!pinned || chosen.total_rappen !== pinned.total_rappen) {
      return refuse("price_changed");
    }
    if (board.engine_version !== payload.engine_version) {
      return refuse("engine_changed");
    }
  }

  return {
    ok: true,
    payload,
    idempotency_key: body.idempotency_key,
  };
}
