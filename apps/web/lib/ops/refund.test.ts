// apps/web/lib/ops/refund.test.ts
//
// 08-05: Stripe-first refund file proofs + mapper. No Hyperdrive.
// Do not import app/api/**/route.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapRefundSqlError, stripeFeeRappen } from "./refund-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("mapRefundSqlError", () => {
  it("maps named RPC refuses", () => {
    expect(mapRefundSqlError({ code: "P0001", message: "not-paid" })).toEqual({
      ok: false,
      code: "not-paid",
    });
    expect(mapRefundSqlError({ code: "P0001", message: "already-refunded" })).toEqual({
      ok: false,
      code: "already-refunded",
    });
    expect(mapRefundSqlError({ code: "P0001", message: "stripe-refund-id-required" })).toEqual({
      ok: false,
      code: "stripe-refund-id-required",
    });
    expect(mapRefundSqlError({ code: "P0002", message: "not-found" })).toEqual({
      ok: false,
      code: "not-found",
    });
  });
});

describe("stripeFeeRappen", () => {
  it("returns null unless Stripe returned a positive fee", () => {
    expect(stripeFeeRappen({})).toBeNull();
    expect(stripeFeeRappen({ balance_transaction: "txn_1" })).toBeNull();
    expect(stripeFeeRappen({ balance_transaction: { fee: 0 } })).toBeNull();
    expect(stripeFeeRappen({ balance_transaction: { fee: 29 } })).toBe(29);
  });
});

describe("08-05 refund file proofs", () => {
  it("migration is SECURITY DEFINER, requires stripe_refund_id, no anon grant, charge gate untouched", () => {
    const sql = read(
      "packages/db/supabase/migrations/20260910170935_ops_refund_record.sql",
    );
    expect(sql).toMatch(/ops_refund_record/);
    expect(sql).toMatch(/ops_cancel_booking/);
    expect(sql.toLowerCase()).toMatch(/security definer/);
    expect(sql).toMatch(/stripe-refund-id-required/);
    expect(sql).toMatch(/stripe_fee_rappen/);
    expect(sql).toMatch(/refund\.issued/);
    expect(sql).toMatch(/booking\.status_changed/);
    expect(sql).toMatch(/to vamos_system/);
    expect(sql.toLowerCase()).not.toMatch(/grant execute[\s\S]*to anon/);
    expect(sql.toLowerCase()).not.toMatch(/grant execute[\s\S]*to authenticated/);
    expect(sql).not.toMatch(/create or replace function public\.tg_payment_matches_snapshot/);
  });

  it("refund.ts plans the intent, then createRefund, then ops_refund_intent_sent (20-10)", () => {
    const src = read("apps/web/lib/ops/refund.ts");
    const planAt = src.indexOf("public.ops_refund_plan(");
    const createAt = src.indexOf("createRefund(stripe");
    const sentAt = src.indexOf("public.ops_refund_intent_sent(");
    const failedAt = src.indexOf("public.ops_refund_intent_failed(");
    expect(planAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(planAt);
    expect(sentAt).toBeGreaterThan(createAt);
    expect(failedAt).toBeGreaterThan(-1);
    expect(src).not.toMatch(/public\.ops_refund_record\(/);
    expect(src).toMatch(/asStaff/);
    expect(src).toMatch(/asSystem/);
    expect(src).toMatch(/sk_live_/);
    expect(src).not.toMatch(/asStaff[\s\S]*insert into public\.booking_refunds/i);
    expect(src).not.toMatch(/:6543/);
  });

  it("resolves the PaymentIntent id before createRefund; a null resolution refuses the refund (D-05)", () => {
    const src = read("apps/web/lib/ops/refund.ts");
    const resolveAt = src.indexOf("resolvePaymentIntentId(");
    const createAt = src.indexOf("createRefund(");
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(createAt);
    expect(src).toMatch(/if \(!paymentIntentId\) throw new Error\("no-payment-intent"\)/);
  });

  it("staff PATCH no longer markRefunded-without-Stripe", () => {
    const item = read(
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts",
    );
    expect(item).not.toMatch(/markRefunded/);
    expect(item).toMatch(/cancelBooking/);
    expect(item).toMatch(/use-refund/);
    const refund = read(
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts",
    );
    expect(refund).toMatch(/refundBooking/);
    expect(refund).toMatch(/refundMailRecipients/);
    expect(refund).toMatch(/sendRefund/);
    // 26.1-17 D-24: refunds are admin-only now (was withStaff).
    expect(refund).toMatch(/withAdmin/);
    const pub = read("apps/web/app/api/staff/bookings/[id]/refund/route.ts");
    expect(pub).toMatch(/export \{ GET, POST \}/);
  });

  it("cancelBooking goes through ops_cancel_booking (events in same tx)", () => {
    const w = read("apps/web/lib/ops/bookings-write.ts");
    expect(w).toMatch(/cancelBooking/);
    expect(w).toMatch(/ops_cancel_booking/);
    expect(w).not.toMatch(/markRefunded/);
    expect(w).toMatch(/asSystem/);
  });

  it("OpsDetail Refund POSTs /refund; paid Cancel stays a separate PATCH; unpaid Cancel DELETEs", () => {
    const t = read("app/ops/OpsDetail.dc.html");
    expect(t).toMatch(/\/refund/);
    expect(t).toMatch(/markRefund:'Refund'/);
    expect(t).toMatch(/cancelBooking:'Cancel'/);
    expect(t).toMatch(/status: 'cancelled'/);
    expect(t).toMatch(/request\('DELETE'/);
    expect(t).not.toMatch(/status: 'refunded'/);
    expect(t).not.toMatch(/location\\.hash/);
    expect(t).not.toMatch(/box-shadow:\s*0 0 \d+px/);
    expect(t).toMatch(/refundFailed/);
  });

  it("sendRefund recipients include company payer when different", () => {
    const send = read("packages/emails/src/lib/send.ts");
    expect(send).toMatch(/refundMailRecipients/);
    expect(send).toMatch(/sendRefund/);
    const idx = send.indexOf("export function refundMailRecipients");
    const body = send.slice(idx, idx + 600);
    expect(body).toMatch(/payer/);
    expect(body).toMatch(/contact/);
  });
});

describe("09-05 D-12 remaining refund", () => {
  it("already-refunded only when remaining is 0; prior row with remaining > 0 is allowed", async () => {
    const { opsRefundAmount } = await import("./refund-map");
    expect(opsRefundAmount({ capturedRappen: 8000, refundedRappen: 3000 })).toEqual({
      remaining: 5000,
      amount: 5000,
    });
    expect(opsRefundAmount({ capturedRappen: 8000, refundedRappen: 8000 })).toEqual({
      remaining: 0,
      amount: 0,
    });
    expect(
      opsRefundAmount({ capturedRappen: 8000, refundedRappen: 3000, rappen: 2000 }),
    ).toEqual({ remaining: 5000, amount: 2000 });
    expect(
      opsRefundAmount({ capturedRappen: 8000, refundedRappen: 0, percent: 50 }),
    ).toEqual({ remaining: 8000, amount: 4000 });
    expect(
      opsRefundAmount({ capturedRappen: 8000, refundedRappen: 5000, rappen: 99999 }),
    ).toEqual({ remaining: 3000, amount: 3000 });

    const src = read("apps/web/lib/ops/refund.ts");
    expect(src).not.toMatch(/if \(existing\[0\]\) return \{ ok: false, code: "already-refunded" \}/);
    expect(src).toMatch(/already-refunded/);
    expect(src).toMatch(/leftRappen <= 0/);
  });

  it("refund route forwards optional percent or rappen", () => {
    const refund = read(
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts",
    );
    expect(refund).toMatch(/percent/);
    expect(refund).toMatch(/rappen/);
    expect(refund).toMatch(/refundBooking/);
    expect(refund).not.toMatch(/status: ['\"]refunded['\"].*bookings/);
  });

  it("20-10 refund route: forwards paymentId and retry, answers partial with amounts, GET is admin-only", () => {
    const refund = read(
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts",
    );
    expect(refund).toMatch(/const requested: RefundRequest = parsed\.value/);
    expect(refund).toMatch(/refundBooking\(env, claims, id, requested\)/);
    expect(refund).toMatch(/paymentId/);
    expect(refund).toMatch(/retry/);
    expect(refund).toMatch(/jsonErr\(result\.code, 502, \{[\s\S]*refundedRappen[\s\S]*dueRappen[\s\S]*parts/);
    expect(refund).toMatch(/export const GET = withAdmin/);
    expect(refund).toMatch(/loadRefundPicker/);
    expect(refund).toMatch(/nothing-to-retry/);
    expect(refund).toMatch(/full-refund-only/);
    // The mail loop only runs after the ok check.
    expect(refund.indexOf("if (!result.ok)")).toBeLessThan(refund.indexOf("sendRefund("));
  });

  it("cancelBooking goes through ops_cancel_booking and never calls Stripe to refund (20-10)", () => {
    const w = read("apps/web/lib/ops/bookings-write.ts");
    expect(w).toMatch(/ops_cancel_booking/);
    expect(w).not.toMatch(/applyStripeRefund|createRefund|record_booking_refund/);
    expect(w).not.toMatch(/status:\s*['\"]refunded['\"]/);
  });
});

describe("26.1-17 D-24/D-25 admin refund decisions", () => {
  it("parseRefundBody: integer percent 0-100, postTrip alone, {} = full remaining", async () => {
    const { parseRefundBody } = await import("./refund-map");
    expect(parseRefundBody({})).toEqual({ ok: true, value: {} });
    expect(parseRefundBody(null)).toEqual({ ok: true, value: {} });
    expect(parseRefundBody({ percent: 40 })).toEqual({ ok: true, value: { percent: 40 } });
    expect(parseRefundBody({ percent: 0 })).toEqual({ ok: true, value: { percent: 0 } });
    expect(parseRefundBody({ percent: 100 })).toEqual({ ok: true, value: { percent: 100 } });
    for (const bad of [-1, 101, 40.5, Number.NaN, "40", true]) {
      expect(parseRefundBody({ percent: bad })).toEqual({ ok: false, code: "invalid-percent" });
    }
    expect(parseRefundBody({ postTrip: true })).toEqual({ ok: true, value: { postTrip: true } });
    expect(parseRefundBody({ postTrip: "yes" })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseRefundBody({ postTrip: true, percent: 40 })).toEqual({
      ok: false,
      code: "invalid-body",
    });
    // 20-10: the exact amount is amountRappen; the old name `rappen` is accepted as the same thing.
    expect(parseRefundBody({ rappen: 1200.7 })).toEqual({ ok: true, value: { amountRappen: 1200 } });
    expect(parseRefundBody({ amountRappen: 1200 })).toEqual({ ok: true, value: { amountRappen: 1200 } });
  });

  it("parseRefundBody 20-10: paymentId, retry, and one of percent / amountRappen, never both", async () => {
    const { parseRefundBody } = await import("./refund-map");
    expect(parseRefundBody({ paymentId: 7, percent: 100 })).toEqual({ ok: true, value: { paymentId: 7, percent: 100 } });
    expect(parseRefundBody({ paymentId: 7, amountRappen: 500 })).toEqual({
      ok: true,
      value: { paymentId: 7, amountRappen: 500 },
    });
    expect(parseRefundBody({ retry: true })).toEqual({ ok: true, value: { retry: true } });
    expect(parseRefundBody({ retry: false })).toEqual({ ok: true, value: {} });
    for (const bad of [
      { percent: 50, amountRappen: 500 },
      { percent: 50, rappen: 500 },
      { amountRappen: 500, rappen: 500 },
      { paymentId: 0 },
      { paymentId: 1.5 },
      { paymentId: "7" },
      { retry: true, percent: 50 },
      { retry: true, paymentId: 7 },
      { retry: true, postTrip: true },
      { retry: "yes" },
      { postTrip: true, paymentId: 7 },
    ]) {
      expect(parseRefundBody(bad)).toEqual({ ok: false, code: "invalid-body" });
    }
    for (const bad of [0, -5, Number.NaN, "500"]) {
      expect(parseRefundBody({ amountRappen: bad })).toEqual({ ok: false, code: "invalid-amount" });
    }
  });

  it("parseRefundDecision accepts decline | reject only", async () => {
    const { parseRefundDecision } = await import("./refund-map");
    expect(parseRefundDecision({ decision: "decline" })).toBe("decline");
    expect(parseRefundDecision({ decision: "reject" })).toBe("reject");
    for (const bad of [{ decision: "accept" }, { decision: "" }, {}, null, "decline", []]) {
      expect(parseRefundDecision(bad)).toBeNull();
    }
  });

  it("opsRefundAmount: 40 % of captured; a zero percent is zero", async () => {
    const { opsRefundAmount } = await import("./refund-map");
    expect(opsRefundAmount({ capturedRappen: 8000, refundedRappen: 0, percent: 40 })).toEqual({
      remaining: 8000,
      amount: 3200,
    });
    expect(opsRefundAmount({ capturedRappen: 8000, refundedRappen: 0, percent: 0 })).toEqual({
      remaining: 8000,
      amount: 0,
    });
  });

  it("maps the new SQL refusals, and 42501 to not-admin", async () => {
    const { mapRefundSqlError } = await import("./refund-map");
    for (const name of [
      "refund-exceeds-remaining",
      "invalid-amount",
      "invalid-reason",
      "invalid-decision",
      "not-pending",
      "not-post-trip",
      "not-open",
      "nothing-to-retry",
      "full-refund-only",
    ]) {
      expect(mapRefundSqlError({ code: "P0001", message: name })).toEqual({ ok: false, code: name });
    }
    expect(mapRefundSqlError({ code: "42501", message: "admin-only" })).toEqual({
      ok: false,
      code: "not-admin",
    });
  });

  it("refundBooking: percent / postTrip / amount reach ops_refund_plan; decided by the admin, recorded per intent", () => {
    const src = read("apps/web/lib/ops/refund.ts");
    expect(src).toMatch(/postTrip\?: boolean/);
    expect(src).toMatch(/"post_trip"/);
    expect(src).toMatch(
      /ops_refund_plan\([\s\S]*\$\{planArgs\.percent\}[\s\S]*\$\{planArgs\.reason\}[\s\S]*\$\{planArgs\.amountRappen\}/,
    );
    expect(src).toMatch(/ops_refund_decide/);
    expect(src).toMatch(/export async function decideRefund/);
    // The customer cancel path is never used by an admin refund.
    expect(src).not.toMatch(/applyStripeRefund|record_booking_refund/);
    // Money never leaves before the amount rules and the post-trip check ran.
    const createAt = src.indexOf("createRefund(stripe");
    for (const name of ["refund-exceeds-remaining", "full-refund-only", "not-post-trip"]) {
      const at = src.indexOf(name);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(createAt);
    }
  });

  it("refund route is admin-only and validates the body; decision route is dual-mounted and admin-only", () => {
    const refund = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts");
    expect(refund).toMatch(/withAdmin/);
    expect(refund).not.toMatch(/withStaff/);
    expect(refund).toMatch(/parseRefundBody/);
    expect(refund).toMatch(/invalid-percent/);
    const decision = read(
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund-decision/route.ts",
    );
    expect(decision).toMatch(/withAdmin/);
    expect(decision).not.toMatch(/withStaff/);
    expect(decision).toMatch(/parseRefundDecision/);
    expect(decision).toMatch(/decideRefund/);
    expect(decision).toMatch(/invalid-decision/);
    const pub = read("apps/web/app/api/staff/bookings/[id]/refund-decision/route.ts");
    expect(pub).toMatch(/export \{ POST \}/);
    expect(pub).toMatch(/refund-decision\/route/);
  });

  it("withAdmin refuses a dispatcher with 403 not-admin", async () => {
    const { staffStatus } = await import("./staff-json");
    expect(staffStatus("not-admin")).toEqual({ code: "not-admin", status: 403 });
    const json = read("apps/web/lib/ops/staff-json.ts");
    expect(json).toMatch(/withAdmin[\s\S]*requireAdminClaims/);
  });
});

describe("20-10: Refund issued mail only when nothing is owed any more", () => {
  it("the route mails 'issued' only when the booking's refund status is refunded", () => {
    const route = readFileSync(
      join(repoRoot, "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/if \(result\.refundStatus === "refunded"\) \{[\s\S]*?sendRefund\(/);
  });

});
