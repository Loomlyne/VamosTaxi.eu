// apps/web/lib/checkout/refund-check.ts
//
// Phase 31 D-09 / D-12 / C-02 (.planning/phases/31-refunds-in-stripe/31-CONTEXT.md): the nightly refund
// check. Since Phase 31 the owner refunds in the Stripe Dashboard and the site only records what Stripe
// reports through the webhook. A lost webhook would leave a booking without its refund, so at 03:00 UTC the
// Worker lists the refunds Stripe made between 48 hours and 30 minutes ago (younger ones may still be on
// their way through the webhook) and compares each with the booking through the read-only definer
// refund_check_read (system-reads.ts).
//
// Rules: it calls Stripe's refund list and nothing else, never writes Stripe and never writes a money table.
// One write is allowed, the customer refund mail: a recorded Stripe Dashboard refund whose mail was never
// claimed (the webhook's claim failed after the refund was recorded, so a replay answers 'already') gets it
// here, through the same claim, send and settle as the webhook (refund-mail.ts). The claim is the guard: a
// refund already claimed sends nothing, a failed send stays on the claim for the notification sweep. One English mail to info@ when something is found (references, CHF amounts, Stripe ids, never
// a name or an address), one "did not run" mail when Stripe does not answer. No state is kept: a finding
// repeats each night while it is inside the 48-hour window. Logs and the result carry counts only.

import { withRequestContext, type LogFields, type LogLevel } from "../logger";
import type { RefundCheckReport } from "@vamos/emails/confirmation";
import { loadRefundCheckRows, type RefundCheckRow } from "../db/system-reads";
import { deliverRefundCheckAlert, deliverRefundCheckDidNotRun } from "../ops/must-fix-mail";
import { CHARGE_CURRENCY } from "./currency";
import { mailCustomerRefund } from "./refund-mail";
import { stripeFromEnv } from "./stripe";
import { stripeReadErrorKind } from "./stripe-fee";

/** Refunds one night compares at most; refund_check_read refuses more. */
export const REFUND_CHECK_CAP = 500;

/** How far back the check looks, and how young a refund may be before it is left to the webhook. */
const WINDOW_SECONDS = 48 * 60 * 60;
const SETTLE_SECONDS = 30 * 60;

/** What the check needs from one Stripe refund. */
export type StripeRefundLite = {
  id: string;
  /** Rappen. */
  amount: number;
  currency: string;
  status: string | null;
  /** Unix seconds. */
  created: number;
  payment_intent: string | null;
  metadata: Record<string, string> | null;
};

export type RefundCheckDeps = {
  /** Stripe refunds created in [gte, lt) (unix seconds), newest first. Throws when Stripe does not answer. */
  listRefunds: (range: { gte: number; lt: number }) => Promise<{ refunds: StripeRefundLite[]; truncated: boolean }>;
  /** One row per item, in input order (refund_check_read). Throws when the database cannot answer. */
  readSite: (items: { id: string; payment_intent: string | null }[]) => Promise<RefundCheckRow[]>;
  sendAlert: (report: RefundCheckReport) => Promise<void>;
  sendDidNotRun: () => Promise<void>;
  /** mailCustomerRefund (refund-mail.ts): claim, send, settle. Never throws. */
  mailRefund: (input: { bookingId: string; stripeRefundId: string; refundRappen: number }) => Promise<void>;
  emit: (level: LogLevel, type: string, fields?: LogFields) => void;
};

export type RefundCheckResult = {
  outcome: "ok" | "did_not_run";
  stripeRefunds: number;
  compared: number;
  skippedInFlight: number;
  skippedAppMissing: number;
  findings: number;
  truncated: boolean;
  mailed: boolean;
  /** Customer refund mails started here because their claim was missing. */
  refundMailsStarted: number;
};

// Plain arrays: module-scope Sets are refused by check:db-fences (isolate memoisation).
const IN_FLIGHT: readonly string[] = ["pending", "requires_action"];
const STRIPE_UNDONE: readonly string[] = ["failed", "canceled"];

/** An int8 from the Worker client (a string) or a number; null stays null. */
function rappen(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function emptyReport(truncated: boolean): RefundCheckReport {
  return { missing: [], amountDiffers: [], totalDiffers: [], statusDiffers: [], unlinked: [], truncated };
}

function findingCount(report: RefundCheckReport): number {
  return (
    report.missing.length +
    report.amountDiffers.length +
    report.totalDiffers.length +
    report.statusDiffers.length +
    report.unlinked.length
  );
}

/** One nightly run. Never writes Stripe or a money table; the only write is a missing customer refund mail. */
export async function refundCheckWithDeps(deps: RefundCheckDeps, now: Date): Promise<RefundCheckResult> {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const range = { gte: nowSeconds - WINDOW_SECONDS, lt: nowSeconds - SETTLE_SECONDS };

  let listed: { refunds: StripeRefundLite[]; truncated: boolean };
  try {
    listed = await deps.listRefunds(range);
  } catch (err) {
    // A fixed word only, never Stripe's error text.
    deps.emit("error", "refund_check_list", { kind: stripeReadErrorKind(err) });
    await deps.sendDidNotRun();
    return {
      outcome: "did_not_run",
      stripeRefunds: 0,
      compared: 0,
      skippedInFlight: 0,
      skippedAppMissing: 0,
      findings: 0,
      truncated: false,
      mailed: true,
      refundMailsStarted: 0,
    };
  }

  // Stripe lists newest first: past the cap, the newest 500 are compared and the mail says so.
  const truncated = listed.truncated || listed.refunds.length > REFUND_CHECK_CAP;
  const refunds = listed.refunds.slice(0, REFUND_CHECK_CAP);

  let skippedInFlight = 0;
  let skippedAppMissing = 0;
  const toCompare: StripeRefundLite[] = [];
  for (const refund of refunds) {
    if (refund.status !== null && IN_FLIGHT.includes(refund.status)) {
      skippedInFlight += 1;
      continue;
    }
    // A paid session whose booking was never created is refunded by the app on purpose and already mails
    // ops (settle.ts refundPaidSessionWithoutBooking): never "not linked".
    if (refund.metadata?.vamos_reason === "booking_missing") {
      skippedAppMissing += 1;
      continue;
    }
    // Every Vamos charge is CHF; a refund in another currency is not ours to compare (never converted).
    if (refund.currency.toLowerCase() !== CHARGE_CURRENCY) continue;
    toCompare.push(refund);
  }

  const report = emptyReport(truncated);
  const unmailed: { bookingId: string; stripeRefundId: string; refundRappen: number }[] = [];
  if (toCompare.length > 0) {
    const rows = await deps.readSite(toCompare.map((r) => ({ id: r.id, payment_intent: r.payment_intent })));
    if (rows.length !== toCompare.length || rows.some((row, i) => row.stripe_refund_id !== toCompare[i]!.id)) {
      throw new Error("refund_check_rows_mismatch");
    }
    const bookingsSeen = new Set<string>();
    toCompare.forEach((refund, i) => {
      const row = rows[i]!;
      if (row.payment_found !== true) {
        report.unlinked.push({ refundId: refund.id, amountRappen: refund.amount, paymentIntentId: refund.payment_intent });
        return;
      }
      const reference = String(row.booking_reference ?? "");
      const siteRappen = rappen(row.site_refund_rappen);
      const reversed = row.site_reversed === true;

      if (refund.status === "succeeded") {
        if (siteRappen === null) {
          report.missing.push({
            reference,
            amountRappen: refund.amount,
            refundId: refund.id,
            createdAt: new Date(refund.created * 1000).toISOString(),
          });
        } else {
          if (siteRappen !== refund.amount) {
            report.amountDiffers.push({ reference, stripeRappen: refund.amount, siteRappen, refundId: refund.id });
          }
          if (reversed) {
            report.statusDiffers.push({ reference, stripeStatus: "succeeded", siteStatus: "failed", refundId: refund.id });
          }
          // Same rule as the webhook (money-events.ts): never for an app-made refund. A refund whose amount
          // differs or that was reversed is a finding for the owner, not a mail.
          const bookingId = row.site_refund_booking_id;
          if (
            row.refund_mail_claimed === false &&
            bookingId &&
            refund.metadata?.vamos_source !== "app" &&
            siteRappen === refund.amount &&
            !reversed
          ) {
            unmailed.push({ bookingId, stripeRefundId: refund.id, refundRappen: siteRappen });
          }
        }
      } else if (refund.status !== null && STRIPE_UNDONE.includes(refund.status) && siteRappen !== null && !reversed) {
        report.statusDiffers.push({ reference, stripeStatus: refund.status, siteStatus: "refunded", refundId: refund.id });
      }

      // Booking total against its refund rows, once per booking. The reader already leaves out rows on
      // duplicate payments and reversed rows (D-12).
      if (reference && !bookingsSeen.has(reference)) {
        bookingsSeen.add(reference);
        const bookingRappen = rappen(row.booking_refunded_rappen);
        const rowsRappen = rappen(row.booking_rows_sum_rappen);
        if (bookingRappen !== null && rowsRappen !== null && bookingRappen !== rowsRappen) {
          report.totalDiffers.push({ reference, bookingRappen, rowsRappen });
        }
      }
    });
  }

  for (const input of unmailed) {
    deps.emit("warn", "refund_check_mail_unclaimed", { bookingId: input.bookingId, refundId: input.stripeRefundId });
    await deps.mailRefund(input);
  }

  const findings = findingCount(report);
  if (findings > 0) await deps.sendAlert(report);
  return {
    outcome: "ok",
    stripeRefunds: listed.refunds.length,
    compared: toCompare.length,
    skippedInFlight,
    skippedAppMissing,
    findings,
    truncated,
    mailed: findings > 0,
    refundMailsStarted: unmailed.length,
  };
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

/** Production wiring for the 03:00 cron (worker.ts). Uses only Stripe's refund list. */
export async function refundCheck(env: CloudflareEnv, now: Date = new Date()): Promise<RefundCheckResult> {
  return refundCheckWithDeps(
    {
      listRefunds: async ({ gte, lt }) => {
        const stripe = stripeFromEnv(env);
        // One past the cap, so "more than 500" is only said when Stripe really listed more.
        const page = stripe.refunds.list({ created: { gte, lt }, limit: 100 });
        const listed = await page.autoPagingToArray({ limit: REFUND_CHECK_CAP + 1 });
        return {
          refunds: listed.map((r) => ({
            id: r.id,
            amount: r.amount,
            currency: String(r.currency ?? ""),
            status: r.status ?? null,
            created: r.created,
            payment_intent: idOf(r.payment_intent),
            metadata: (r.metadata as Record<string, string> | null) ?? null,
          })),
          truncated: false,
        };
      },
      readSite: (items) => loadRefundCheckRows(env, items),
      sendAlert: (report) => deliverRefundCheckAlert(env, report),
      sendDidNotRun: () => deliverRefundCheckDidNotRun(env),
      mailRefund: (input) => mailCustomerRefund(env, input),
      // The cron logs the result; this run logs only the listing failure word.
      emit: withRequestContext({ requestId: crypto.randomUUID(), route: "cron:refund_check", locale: null }),
    },
    now,
  );
}
