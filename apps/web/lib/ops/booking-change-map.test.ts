// apps/web/lib/ops/booking-change-map.test.ts
//
// 26.2 P1: the rules of a class change on a paid trip (plan rules + D8) and the strict body.

import { describe, expect, it } from "vitest";
import {
  changeFailStatus,
  changeRefusal,
  mapChangeSqlError,
  parseChangeBody,
  type ChangeRuleFacts,
} from "./booking-change-map";

const NOW = Date.parse("2026-10-01T08:00:00Z");
const ok: ChangeRuleFacts = {
  paid: true,
  status: "confirmed",
  refundStatus: "none",
  pickupAtMs: NOW + 3_600_000,
  customerRequestWaiting: false,
};

describe("changeRefusal (plan rules, D8)", () => {
  it("allows a paid, confirmed or assigned booking before the pickup time", () => {
    expect(changeRefusal(ok, NOW)).toBeNull();
    expect(changeRefusal({ ...ok, status: "assigned" }, NOW)).toBeNull();
    expect(changeRefusal({ ...ok, status: "paid" }, NOW)).toBeNull();
  });
  it("no class change on an unpaid booking", () => {
    expect(changeRefusal({ ...ok, paid: false }, NOW)).toBe("unpaid");
  });
  it("cancelled, completed or no-show bookings are not changed", () => {
    for (const status of ["cancelled", "completed", "no_show", "refunded", "partially_cancelled"]) {
      expect(changeRefusal({ ...ok, status }, NOW)).toBe("not-editable");
    }
  });
  it("allowed until the pickup time, not after (D8)", () => {
    expect(changeRefusal({ ...ok, pickupAtMs: NOW + 60_000 }, NOW)).toBeNull();
    expect(changeRefusal({ ...ok, pickupAtMs: NOW }, NOW)).toBe("too-late");
    expect(changeRefusal({ ...ok, pickupAtMs: null }, NOW)).toBe("too-late");
  });
  it("refused while a refund is being sent", () => {
    expect(changeRefusal({ ...ok, refundStatus: "processing" }, NOW)).toBe("refund-open");
    expect(changeRefusal({ ...ok, refundStatus: "failed" }, NOW)).toBe("refund-open");
    expect(changeRefusal({ ...ok, refundStatus: "pending_ops" }, NOW)).toBeNull();
  });
  it("refused while the customer's own change request waits", () => {
    expect(changeRefusal({ ...ok, customerRequestWaiting: true }, NOW)).toBe("customer-request-waiting");
  });
});

describe("parseChangeBody (the browser never sends an amount or a changed field to apply)", () => {
  it("takes a class slug and the two figures shown", () => {
    expect(parseChangeBody({ klass: "Mercedes-Benz-V-Class", expectTotalRappen: 13, expectPaidRappen: 10 })).toEqual({
      ok: true,
      value: { klass: "mercedes-benz-v-class", expectTotalRappen: 13, expectPaidRappen: 10 },
    });
    expect(parseChangeBody({})).toEqual({ ok: true, value: { klass: null, expectTotalRappen: null, expectPaidRappen: null } });
  });
  it("refuses any other field, such as a pickup text or an amount to charge", () => {
    expect(parseChangeBody({ klass: "saden", pickup: "Somewhere" })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeBody({ klass: "saden", totalRappen: 1 })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeBody({ klass: "saden", expectTotalRappen: -1 })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeBody({ klass: "saden", expectTotalRappen: 1.5 })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeBody({ klass: "<b>" })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeBody([1])).toEqual({ ok: false, code: "invalid-body" });
  });
});

describe("mapChangeSqlError", () => {
  it("maps each RAISE of booking_staff_change to its code", () => {
    for (const name of ["unpaid", "too-late", "customer-request-waiting", "same-class", "class-too-small", "price-book-changed", "paid-changed", "refund-open", "unknown-class", "not-editable"]) {
      expect(mapChangeSqlError(Object.assign(new Error(name), { code: "P0001" }))).toEqual({ ok: false, code: name });
    }
    expect(mapChangeSqlError(Object.assign(new Error("not-found"), { code: "P0002" }))).toEqual({ ok: false, code: "not-found" });
    expect(mapChangeSqlError(Object.assign(new Error("capacity"), { code: "P0001" }))).toEqual({ ok: false, code: "must-fix" });
    expect(mapChangeSqlError(Object.assign(new Error("conflicting key value"), { code: "23P01" }))).toEqual({ ok: false, code: "must-fix" });
    expect(mapChangeSqlError(new Error("boom"))).toEqual({ ok: false, code: "unknown" });
  });
  it("answers 404 / 409 / 502 / 400", () => {
    expect(changeFailStatus("not-found")).toBe(404);
    expect(changeFailStatus("too-late")).toBe(409);
    expect(changeFailStatus("stripe-failed")).toBe(502);
    expect(changeFailStatus("invalid-body")).toBe(400);
  });
});
