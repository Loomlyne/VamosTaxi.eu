// apps/web/lib/meta/purchase.ts
//
// Phase 29, META-10..14. The only path to Meta's Graph API. Order: legal gate, token, Stripe mode,
// claim (database decides), one POST, record the outcome once, log. Nothing is retried and the
// function never rejects. Logs carry bookingId, outcome, reason, http and code only (D-06): never
// the token, fbp, fbc, the consent subject, a trace id or a Graph message.
import { asSystem } from "@/lib/db/identity";
import { CONSENT_POLICY_VERSION } from "@/lib/consent/policy";
import { sqlStateOf } from "@/lib/checkout/settle-errors";
import type { ScalarValue } from "@/lib/logger";
import { buildPurchaseEvent, postPurchase, type PostOutcome } from "./capi";
import { metaMeasurementAllowed } from "./legal-gate";

type Emit = (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;

export type MetaPurchaseInput = { bookingId: string; paymentId: number; livemode: boolean; refundRequired: boolean };

export type WorkerSkip = "gate_closed" | "no_token" | "no_test_code" | null;

export type ClaimRow = {
  decision: "send" | "skip" | "already";
  reason: string | null;
  eventId: string | null;
  fbp: string | null;
  fbc: string | null;
  chargedRappen: number | null;
  capturedAt: Date | null;
};

export type MetaPurchaseDeps = {
  measurementAllowed: () => boolean;
  token: () => string | null;
  testEventCode: () => string | null;
  claim: (
    bookingId: string,
    paymentId: number,
    policyVersion: string,
    testEvent: boolean,
    refundRequired: boolean,
    workerSkip: WorkerSkip,
  ) => Promise<ClaimRow>;
  finish: (
    bookingId: string,
    eventId: string,
    state: PostOutcome["state"],
    http: number | null,
    code: number | null,
    subcode: number | null,
  ) => Promise<void>;
  clearIds: (bookingId: string) => Promise<void>;
  fetch: typeof fetch;
  emit: Emit;
};

/** `<code>.<subcode>` when both exist, the code alone otherwise. */
function codeField(code: number | null, subcode: number | null): string | null {
  if (code === null) return null;
  return subcode === null ? String(code) : `${code}.${subcode}`;
}

/**
 * Sends the Purchase for one paid booking, at most once. Never rejects.
 * @param input booking, payment, Stripe mode and whether a refund exists
 * @param deps injected gate, token, database calls, fetch and logger
 */
export async function sendMetaPurchase(input: MetaPurchaseInput, deps: MetaPurchaseDeps): Promise<void> {
  const { bookingId } = input;
  const log = (level: "info" | "warn" | "error", fields: Record<string, ScalarValue>) => {
    try {
      deps.emit(level, "meta_purchase", { bookingId, ...fields });
    } catch {
      // logging must never break the caller
    }
  };
  try {
    const token = deps.token();
    const testCode = deps.testEventCode();
    const testEvent = !input.livemode;
    const workerSkip: WorkerSkip = !deps.measurementAllowed()
      ? "gate_closed"
      : !token
        ? "no_token"
        : testEvent && !testCode
          ? "no_test_code"
          : null;

    let claim: ClaimRow;
    try {
      claim = await deps.claim(
        bookingId,
        input.paymentId,
        CONSENT_POLICY_VERSION,
        testEvent,
        input.refundRequired,
        workerSkip,
      );
    } catch (err) {
      log("error", { outcome: "error", reason: "claim_failed", code: sqlStateOf(err) ?? null });
      try {
        await deps.clearIds(bookingId);
      } catch {
        log("error", { outcome: "error", reason: "clear_failed" });
      }
      return;
    }

    if (claim.decision !== "send" || workerSkip !== null || input.refundRequired) {
      log("info", {
        outcome: claim.decision === "already" ? "already" : "skip",
        reason: claim.reason ?? workerSkip ?? (input.refundRequired ? "refunded" : null),
      });
      return;
    }

    const event =
      claim.eventId && claim.capturedAt && claim.chargedRappen !== null
        ? buildPurchaseEvent({
            eventId: claim.eventId,
            eventTimeSeconds: Math.floor(claim.capturedAt.getTime() / 1000),
            chargedRappen: claim.chargedRappen,
            fbp: claim.fbp,
            fbc: claim.fbc,
          })
        : null;

    let outcome: PostOutcome;
    if (!event || !token || !claim.eventId) {
      outcome = { state: "failed", http: null, code: null, subcode: null };
    } else {
      outcome = await postPurchase(deps.fetch, {
        event,
        token,
        testEventCode: testEvent ? testCode : null,
      });
    }

    if (claim.eventId) {
      try {
        await deps.finish(bookingId, claim.eventId, outcome.state, outcome.http, outcome.code, outcome.subcode);
      } catch (err) {
        log("error", { outcome: "error", reason: "finish_failed", code: sqlStateOf(err) ?? null });
        return;
      }
    }
    log(outcome.state === "sent" ? "info" : "error", {
      outcome: outcome.state,
      http: outcome.http,
      code: codeField(outcome.code, outcome.subcode),
    });
  } catch {
    log("error", { outcome: "error", reason: "unexpected" });
  }
}

type DbClaimRow = {
  decision: string;
  reason: string | null;
  event_id: string | null;
  fbp: string | null;
  fbc: string | null;
  charged_rappen: number | string | null;
  captured_at: Date | string | null;
};

/**
 * Production wiring. This is the only file that reads the CAPI token binding; it is never logged.
 * Database errors are thrown out of `asSystem` to the caller, never caught inside its callback.
 */
export function metaPurchaseDepsFromEnv(env: CloudflareEnv, emit: Emit): MetaPurchaseDeps {
  return {
    measurementAllowed: metaMeasurementAllowed,
    token: () => env.META_CAPI_ACCESS_TOKEN || null,
    testEventCode: () => env.META_TEST_EVENT_CODE || null,
    claim: async (bookingId, paymentId, policyVersion, testEvent, refundRequired, workerSkip) => {
      const rows = await asSystem(
        env,
        (sql) => sql<DbClaimRow[]>`
          select * from public.meta_purchase_claim(${bookingId}::uuid, ${paymentId}::int8, ${policyVersion},
            ${testEvent}, ${refundRequired}, ${workerSkip})`,
      );
      const r = rows[0];
      if (!r) throw new Error("meta_purchase_claim returned no row");
      return {
        decision: r.decision as ClaimRow["decision"],
        reason: r.reason,
        eventId: r.event_id,
        fbp: r.fbp,
        fbc: r.fbc,
        chargedRappen: r.charged_rappen === null ? null : Number(r.charged_rappen),
        capturedAt: r.captured_at === null ? null : new Date(r.captured_at),
      };
    },
    finish: async (bookingId, eventId, state, http, code, subcode) => {
      await asSystem(
        env,
        (sql) => sql`
          select public.meta_purchase_finish(${bookingId}::uuid, ${eventId}::uuid, ${state},
            ${http}::int4, ${code}::int4, ${subcode}::int4)`,
      );
    },
    clearIds: async (bookingId) => {
      await asSystem(env, (sql) => sql`select public.meta_purchase_clear_ids(${bookingId}::uuid)`);
    },
    fetch: (...a) => fetch(...a),
    emit,
  };
}
