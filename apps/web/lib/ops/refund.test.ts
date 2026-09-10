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

  it("refund.ts calls createRefund before ops_refund_record", () => {
    const src = read("apps/web/lib/ops/refund.ts");
    const createAt = src.indexOf("createRefund");
    const rpcAt = src.indexOf("ops_refund_record");
    expect(createAt).toBeGreaterThan(-1);
    expect(rpcAt).toBeGreaterThan(-1);
    expect(createAt).toBeLessThan(rpcAt);
    expect(src).toMatch(/asSystem/);
    expect(src).toMatch(/sk_live_/);
    expect(src).not.toMatch(/asStaff/);
    expect(src).not.toMatch(/:6543/);
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
    expect(refund).toMatch(/withStaff/);
    const pub = read("apps/web/app/api/staff/bookings/[id]/refund/route.ts");
    expect(pub).toMatch(/export \{ POST \}/);
  });

  it("cancelBooking goes through ops_cancel_booking (events in same tx)", () => {
    const w = read("apps/web/lib/ops/bookings-write.ts");
    expect(w).toMatch(/cancelBooking/);
    expect(w).toMatch(/ops_cancel_booking/);
    expect(w).not.toMatch(/markRefunded/);
    expect(w).toMatch(/asSystem/);
  });

  it("OpsDetail Refund POSTs /refund; Cancel stays a separate PATCH", () => {
    const t = read("app/ops/OpsDetail.dc.html");
    expect(t).toMatch(/\/refund/);
    expect(t).toMatch(/markRefund:'Refund'/);
    expect(t).toMatch(/cancelBooking:'Cancel'/);
    expect(t).toMatch(/status: 'cancelled'/);
    expect(t).not.toMatch(/status: 'refunded'/);
    expect(t).not.toMatch(/location\.hash/);
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
