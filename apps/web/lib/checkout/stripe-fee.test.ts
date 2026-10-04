import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { WEB_ROOT } from "../../tests/support/server-harness";
import {
  STRIPE_FEE_MAX_FAILURES_IN_A_ROW,
  STRIPE_FEE_SWEEP_LIMIT,
  readStripeFee,
  stripeFeeOfCharge,
  sweepStripeFeesWithDeps,
  type StripeFeeRead,
  type StripeFeeSweepDeps,
} from "./stripe-fee";

// Synthetic rappen integers only, never a product CHF figure.
function charge(bt: unknown, status = "succeeded"): unknown {
  return { id: "ch_1", object: "charge", status, balance_transaction: bt };
}

function bt(fee: unknown, currency = "chf", amount: unknown = 10_000): unknown {
  return { id: "txn_1", object: "balance_transaction", fee, currency, amount };
}

describe("stripeFeeOfCharge", () => {
  it("returns the fee of a succeeded charge whose balance transaction is in CHF", () => {
    expect(stripeFeeOfCharge(charge(bt(317)))).toEqual({ kind: "fee", feeRappen: 317 });
    expect(stripeFeeOfCharge(charge(bt(317, "CHF")))).toEqual({ kind: "fee", feeRappen: 317 });
  });

  it("waits while Stripe has not attached the balance transaction or the charge is still processing", () => {
    expect(stripeFeeOfCharge(charge(null))).toEqual({ kind: "pending" });
    expect(stripeFeeOfCharge(charge(undefined))).toEqual({ kind: "pending" });
    expect(stripeFeeOfCharge(charge(bt(317), "pending"))).toEqual({ kind: "pending" });
  });

  it("never converts: a balance transaction in another currency is not a fee to record", () => {
    expect(stripeFeeOfCharge(charge(bt(317, "aed")))).toEqual({ kind: "skip", reason: "not_chf" });
    expect(stripeFeeOfCharge(charge(bt(317, "eur")))).toEqual({ kind: "skip", reason: "not_chf" });
    expect(stripeFeeOfCharge(charge(bt(317, "")))).toEqual({ kind: "skip", reason: "not_chf" });
  });

  it("records nothing for a zero fee, a failed charge or a shape it does not expect", () => {
    expect(stripeFeeOfCharge(charge(bt(0)))).toEqual({ kind: "skip", reason: "no_fee" });
    expect(stripeFeeOfCharge(charge(bt(317), "failed"))).toEqual({ kind: "skip", reason: "not_captured" });
    expect(stripeFeeOfCharge(charge("txn_1"))).toEqual({ kind: "skip", reason: "unexpected" });
    expect(stripeFeeOfCharge(charge(bt(-3)))).toEqual({ kind: "skip", reason: "unexpected" });
    expect(stripeFeeOfCharge(charge(bt(3.5)))).toEqual({ kind: "skip", reason: "unexpected" });
    expect(stripeFeeOfCharge(charge(bt("317")))).toEqual({ kind: "skip", reason: "unexpected" });
    expect(stripeFeeOfCharge(charge(bt(10_000)))).toEqual({ kind: "skip", reason: "unexpected" });
    expect(stripeFeeOfCharge(charge(bt(317, "chf", null)))).toEqual({ kind: "skip", reason: "unexpected" });
    expect(stripeFeeOfCharge(null)).toEqual({ kind: "skip", reason: "unexpected" });
    expect(stripeFeeOfCharge("ch_1")).toEqual({ kind: "skip", reason: "unexpected" });
  });
});

describe("readStripeFee", () => {
  it("reads the PaymentIntent's latest charge with its balance transaction expanded", async () => {
    const retrieve = vi.fn(async () => ({ latest_charge: charge(bt(317)) }));
    const stripe = { paymentIntents: { retrieve } } as unknown as Stripe;
    expect(await readStripeFee(stripe, "pi_3Abc")).toEqual({ kind: "fee", feeRappen: 317 });
    expect(retrieve).toHaveBeenCalledWith("pi_3Abc", { expand: ["latest_charge.balance_transaction"] });
  });

  it("never asks Stripe for an id that is not a PaymentIntent", async () => {
    const retrieve = vi.fn();
    const stripe = { paymentIntents: { retrieve } } as unknown as Stripe;
    expect(await readStripeFee(stripe, "cs_test_1")).toEqual({ kind: "skip", reason: "unexpected" });
    expect(await readStripeFee(stripe, "")).toEqual({ kind: "skip", reason: "unexpected" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("throws a Stripe error to the sweep so the payment is tried again", async () => {
    const stripe = {
      paymentIntents: {
        retrieve: vi.fn(async () => {
          throw new Error("stripe down");
        }),
      },
    } as unknown as Stripe;
    await expect(readStripeFee(stripe, "pi_3Abc")).rejects.toThrow("stripe down");
  });
});

function deps(reads: Record<string, StripeFeeRead | Error>, recordAnswer: boolean | Error = true) {
  const recorded: Array<[string, number]> = [];
  const pending = vi.fn(async () => Object.keys(reads));
  const d: StripeFeeSweepDeps = {
    pending,
    read: vi.fn(async (id: string) => {
      const r = reads[id];
      if (r instanceof Error) throw r;
      return r as StripeFeeRead;
    }),
    record: vi.fn(async (id: string, fee: number) => {
      if (recordAnswer instanceof Error) throw recordAnswer;
      recorded.push([id, fee]);
      return recordAnswer;
    }),
  };
  return { d, recorded, pending };
}

describe("sweepStripeFeesWithDeps", () => {
  it("records each fee Stripe reported in CHF and nothing else", async () => {
    const { d, recorded, pending } = deps({
      pi_a: { kind: "fee", feeRappen: 317 },
      pi_b: { kind: "pending" },
      pi_c: { kind: "skip", reason: "not_chf" },
      pi_d: { kind: "skip", reason: "no_fee" },
      pi_e: { kind: "fee", feeRappen: 290 },
    });
    const result = await sweepStripeFeesWithDeps(d);
    expect(pending).toHaveBeenCalledWith(STRIPE_FEE_SWEEP_LIMIT);
    expect(recorded).toEqual([
      ["pi_a", 317],
      ["pi_e", 290],
    ]);
    expect(result).toEqual({ checked: 5, recorded: 2, waiting: 1, notChf: 1, skipped: 1, failed: 0, stopped: false });
  });

  it("a Stripe failure leaves that fee empty and the run goes on", async () => {
    const { d, recorded } = deps({
      pi_a: new Error("timeout"),
      pi_b: { kind: "fee", feeRappen: 317 },
    });
    const result = await sweepStripeFeesWithDeps(d);
    expect(recorded).toEqual([["pi_b", 317]]);
    expect(result.failed).toBe(1);
    expect(result.recorded).toBe(1);
  });

  it("stops after Stripe fails several times in a row", async () => {
    const reads: Record<string, StripeFeeRead | Error> = {};
    for (let i = 0; i < STRIPE_FEE_MAX_FAILURES_IN_A_ROW + 2; i += 1) reads[`pi_${i}`] = new Error("down");
    const { d } = deps(reads);
    const result = await sweepStripeFeesWithDeps(d);
    expect(result.stopped).toBe(true);
    expect(result.failed).toBe(STRIPE_FEE_MAX_FAILURES_IN_A_ROW);
    expect(d.read).toHaveBeenCalledTimes(STRIPE_FEE_MAX_FAILURES_IN_A_ROW);
  });

  it("a database refusal or error never throws out of the run", async () => {
    const refused = deps({ pi_a: { kind: "fee", feeRappen: 317 } }, false);
    expect(await sweepStripeFeesWithDeps(refused.d)).toMatchObject({ recorded: 0, skipped: 1, failed: 0 });
    const broken = deps({ pi_a: { kind: "fee", feeRappen: 317 } }, new Error("deadlock"));
    expect(await sweepStripeFeesWithDeps(broken.d)).toMatchObject({ recorded: 0, failed: 1 });
  });

  it("fails as a whole when the list of payments cannot be read", async () => {
    const { d } = deps({});
    d.pending = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(sweepStripeFeesWithDeps(d)).rejects.toThrow("db down");
    expect(d.read).not.toHaveBeenCalled();
  });
});

describe("wiring", () => {
  const worker = readFileSync(join(WEB_ROOT, "worker.ts"), "utf8");
  const src = readFileSync(join(WEB_ROOT, "lib/checkout/stripe-fee.ts"), "utf8");
  const settle = readFileSync(join(WEB_ROOT, "lib/checkout/settle.ts"), "utf8");

  it("the hourly cron runs the sweep in its own try/catch, after the 03:00 branch returned", () => {
    const at = worker.indexOf("await sweepStripeFees(env)");
    expect(at).toBeGreaterThan(worker.indexOf('if (controller.cron === "0 3 * * *")'));
    expect(worker).toMatch(
      /try \{\s*const fees = await sweepStripeFees\(env\);\s*emit\("info", "stripe_fee_sweep", fees\);\s*\} catch \{\s*emit\("error", "stripe_fee_sweep", \{ outcome: "failed" \}\);\s*\}/,
    );
  });

  it("goes through the two definer functions as vamos_system, never the table", () => {
    expect(src).toContain("public.checkout_payment_fee_pending(");
    expect(src).toContain("public.checkout_payment_fee_record(");
    expect(src).toContain("asSystem");
    expect(src).not.toMatch(/update\s+public\.booking_payments/i);
  });

  it("settlement does not wait on the fee", () => {
    expect(settle).not.toContain("stripe-fee");
    expect(settle).not.toContain("checkout_payment_fee_record");
  });
});
