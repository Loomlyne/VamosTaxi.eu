// apps/web/lib/ops/refund.test.ts
//
// Phase 31 (D-01): refunds are made in the Stripe Dashboard. The site no longer sends a refund on the
// owner's command: lib/ops/refund.ts and the refund / refund-decision routes (both mounts) are gone.
// What stays here is the SQL error map other dashboard answers share, plus pins that the sender
// does not come back. No Hyperdrive. Do not import app/api/**/route.ts.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as refundMap from "./refund-map";
import { mapRefundSqlError } from "./refund-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (/^route\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("Phase 31: refunds are made in Stripe; the site keeps only the SQL error maps", () => {
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

    it("maps the review-tier and by-hand SQL refusals, and 42501 to not-admin", () => {
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
  });

  describe("the kept maps are still exported (bookings-write, edit-request-map, booking-change-map import them)", () => {
    it("exports sqlErrorCode, PAYMENT_CHANGED, isPaymentChanged, mapRefundSqlError, refundFailStatus", () => {
      expect(typeof refundMap.sqlErrorCode).toBe("function");
      expect(refundMap.PAYMENT_CHANGED).toBe("payment-changed");
      expect(typeof refundMap.isPaymentChanged).toBe("function");
      expect(typeof refundMap.mapRefundSqlError).toBe("function");
      expect(typeof refundMap.refundFailStatus).toBe("function");
    });

    it("exports nothing else: the refund request parsers and the Stripe fee reader are gone", () => {
      expect(Object.keys(refundMap).sort()).toEqual(
        ["PAYMENT_CHANGED", "isPaymentChanged", "mapRefundSqlError", "refundFailStatus", "sqlErrorCode"].sort(),
      );
    });
  });

  describe("D-01: the dashboard cannot send a refund", () => {
    const removed = [
      "apps/web/lib/ops/refund.ts",
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts",
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund-decision/route.ts",
      "apps/web/app/api/staff/bookings/[id]/refund/route.ts",
      "apps/web/app/api/staff/bookings/[id]/refund-decision/route.ts",
    ];

    it.each(removed)("%s does not exist", (rel) => {
      expect(existsSync(join(repoRoot, rel))).toBe(false);
    });

    it("no route under apps/web/app exports POST on a /bookings/[id]/refund path", () => {
      const appDir = join(repoRoot, "apps/web/app");
      const offenders = routeFiles(appDir)
        .map((full) => relative(repoRoot, full).split("\\").join("/"))
        .filter((rel) => rel.includes("/bookings/[id]/refund"))
        .filter((rel) => /export\s+(const|async function|function)\s+POST\b|export\s*\{[^}]*\bPOST\b/.test(read(rel)));
      expect(offenders).toEqual([]);
    });
  });

  describe("kept neighbours", () => {
    it("migration ops_refund_record stays SECURITY DEFINER with no anon/authenticated grant (D-07: SQL untouched)", () => {
      const sql = read("packages/db/supabase/migrations/20260910170935_ops_refund_record.sql");
      expect(sql).toMatch(/ops_refund_record/);
      expect(sql).toMatch(/ops_cancel_booking/);
      expect(sql.toLowerCase()).toMatch(/security definer/);
      expect(sql).toMatch(/stripe-refund-id-required/);
      expect(sql).toMatch(/to vamos_system/);
      expect(sql.toLowerCase()).not.toMatch(/grant execute[\s\S]*to anon/);
      expect(sql.toLowerCase()).not.toMatch(/grant execute[\s\S]*to authenticated/);
    });

    it("staff PATCH never marks a booking refunded without Stripe", () => {
      const item = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts");
      expect(item).not.toMatch(/markRefunded/);
      expect(item).toMatch(/cancelBooking/);
    });

    it("cancelBooking goes through ops_cancel_booking and never calls Stripe to refund", () => {
      const w = read("apps/web/lib/ops/bookings-write.ts");
      expect(w).toMatch(/ops_cancel_booking/);
      expect(w).toMatch(/asSystem/);
      expect(w).not.toMatch(/markRefunded/);
      expect(w).not.toMatch(/applyStripeRefund|createRefund|record_booking_refund/);
      expect(w).not.toMatch(/status:\s*['"]refunded['"]/);
    });

    it("withAdmin refuses a dispatcher with 403 not-admin", async () => {
      const { staffStatus } = await import("./staff-json");
      expect(staffStatus("not-admin")).toEqual({ code: "not-admin", status: 403 });
      const json = read("apps/web/lib/ops/staff-json.ts");
      expect(json).toMatch(/withAdmin[\s\S]*requireAdminClaims/);
    });
  });

  describe("J7 W6-05: a refund Stripe later failed is not counted as refunded", () => {
    it.each(["apps/web/lib/ops/bookings.ts", "apps/web/lib/ops/booking-change.ts"])(
      "%s sums booking_refunds net of booking_refund_reversals",
      (file) => {
        const src = read(file);
        const sums = src.split("\n").filter((l) => /sum\((r|br)\.refund_rappen\)/.test(l));
        expect(sums.length).toBeGreaterThan(0);
        expect(src).toMatch(/not exists \(select 1 from public\.booking_refund_reversals/);
      },
    );
  });
});
