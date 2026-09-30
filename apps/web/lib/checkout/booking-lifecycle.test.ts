import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WEB_ROOT } from "../../tests/support/server-harness";
import {
  accountBookingHref,
  accountListIncludesStatus,
  accountUiStatus,
  EXTRAS_OFF,
  isTravelerComplete,
  shouldAbandonUnpaid,
  shouldPersistUnpaidBooking,
  UNPAID_TTL_HOURS,
} from "./booking-lifecycle";

const filled = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
  mobile: "+41796267082",
};

const empty = { firstName: "", lastName: "", email: "", mobile: "" };

describe("booking lifecycle", () => {
  it("keeps extras off until the traveller turns them on", () => {
    expect(EXTRAS_OFF).toEqual({
      childSeat: false,
      oversizedLuggage: false,
      skiRack: false,
    });
  });

  it("requires every who-is-travelling field", () => {
    expect(isTravelerComplete(empty)).toBe(false);
    expect(isTravelerComplete({ ...filled, firstName: "" })).toBe(false);
    expect(isTravelerComplete({ ...filled, email: "nope" })).toBe(false);
    expect(isTravelerComplete(filled)).toBe(true);
  });

  it("never treats /checkout/trip as a saved booking", () => {
    expect(shouldPersistUnpaidBooking("trip", filled)).toBe(false);
    expect(shouldPersistUnpaidBooking("details", empty)).toBe(false);
    expect(shouldPersistUnpaidBooking("details", filled)).toBe(true);
    expect(shouldPersistUnpaidBooking("payment", filled)).toBe(true);
  });

  it("lists a sent pay-link and hides an unpaid row with no email", () => {
    expect(accountListIncludesStatus("quote")).toBe(false);
    expect(accountListIncludesStatus("pending")).toBe(false);
    expect(accountListIncludesStatus("pending", true)).toBe(true);
    expect(accountListIncludesStatus("confirmed")).toBe(true);
    expect(accountUiStatus("pending", true)).toBe("unpaid");
    expect(accountUiStatus("confirmed", true)).toBe("finished");
    expect(accountUiStatus("confirmed")).toBe("confirmed");
    expect(accountBookingHref("pending", "VT-26-0001", true)).toBe("/confirmation/VT-26-0001");
    expect(accountBookingHref("confirmed", "VT-26-0001")).toBe("/confirmation/VT-26-0001");
    expect(shouldAbandonUnpaid("pending")).toBe(true);
    expect(shouldAbandonUnpaid("pending", true)).toBe(false);
    expect(shouldAbandonUnpaid("confirmed")).toBe(false);
    expect(UNPAID_TTL_HOURS).toBe(24);
  });
});

describe("home starts a new booking", () => {
  it("home drops the stale browser trip and never resumes an old booking", () => {
    const home = readFileSync(join(WEB_ROOT, "../../app/home/home.dc.html"), "utf8");
    expect(home).toContain("function cleanStaleTrip");
    expect(home).toContain("localStorage.removeItem('vamosTrip')");
    expect(home).toContain("sessionStorage.removeItem('vamosTrip')");
    expect(home).toContain("sessionStorage.removeItem('vamosQuoteLock')");
    expect(home).toContain("cleanStaleTrip()");
  });
});

describe("unpaid card cancel + 24h expire", () => {
  it("account cancel uses asCustomer checkout_cancel_unpaid", () => {
    // 26.1-06 moved the RPC call into lib/checkout/cancel-unpaid.ts; the route delegates.
    const route = readFileSync(join(WEB_ROOT, "app/api/account/bookings/cancel/route.ts"), "utf8");
    expect(route).toContain("cancelUnpaidForCustomer");
    expect(route).not.toContain("asSystem");
    const src = readFileSync(join(WEB_ROOT, "lib/checkout/cancel-unpaid.ts"), "utf8");
    expect(src).toContain("asCustomer");
    expect(src).toContain("checkout_cancel_unpaid");
    expect(src).not.toContain("asSystem");
  });

  it("hourly worker expires unpaid pending", () => {
    const worker = readFileSync(join(WEB_ROOT, "worker.ts"), "utf8");
    const expire = readFileSync(join(WEB_ROOT, "lib/checkout/expire-unpaid.ts"), "utf8");
    expect(worker).toContain("expireUnpaidBookings");
    expect(expire).toContain("asSystem");
    expect(expire).toContain("checkout_expire_unpaid");
  });

  it("checkout_expire_unpaid uses quote_lock_expires_at, not created_at + 24 hours (D-22)", () => {
    const sql = readFileSync(
      join(WEB_ROOT, "../../packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql"),
      "utf8",
    );
    const expire = readFileSync(join(WEB_ROOT, "lib/checkout/expire-unpaid.ts"), "utf8");
    const fn = sql.slice(
      sql.indexOf("create or replace function public.checkout_expire_unpaid"),
      sql.indexOf("revoke all on function public.checkout_expire_unpaid"),
    );
    expect(fn).toContain("quote_lock_expires_at");
    expect(fn).toMatch(/b\.status = 'pending'/);
    expect(fn).not.toMatch(/created_at\s*\+\s*interval\s+'24 hours'/);
    expect(fn).not.toMatch(/created_at \+ 24/);
    expect(fn).toMatch(/ps\.quote_lock_expires_at <= now\(\)/);
    expect(expire).toMatch(/quote_lock_expires_at/);
    // Paid / confirmed trips are not selected — only pending.
    expect(fn).not.toMatch(/status = 'paid'/);
    expect(fn).not.toMatch(/status = 'confirmed'/);
  });

  it("BookingRow unpaid card has Cancel above the hit overlay", () => {
    const row = readFileSync(join(WEB_ROOT, "../../app/pages/BookingRow.dc.html"), "utf8");
    expect(row).toContain("data-bk-payacts");
    expect(row).toContain("cancelUnpaid");
    expect(row).toContain("A pay link was emailed. It stays here until that link is paid.");
    expect(row).toContain('data-bk-unpaid="{{ unpaidFlag }}"');
    expect(row).toContain("data-bk-mid");
    expect(row).not.toContain('data-bk-ref="1"');
  });

  it("account upcoming uses the same ticket card as bookings", () => {
    const account = readFileSync(join(WEB_ROOT, "../../app/pages/account.dc.html"), "utf8");
    expect(account).toContain('onCancel="{{ cancelUnpaid }}"');
    expect(account).not.toContain('variant="inset"');
  });

  it("bookings list wires Cancel to the unpaid RPC", () => {
    const src = readFileSync(join(WEB_ROOT, "../../app/pages/bookings.dc.html"), "utf8");
    expect(src).toContain('onCancel="{{ cancelUnpaid }}"');
    expect(src).toContain("reference=\"{{ b.ref }}\"");
    expect(src).toContain("/api/account/bookings/cancel");
    expect(src).toContain("ref: r.id");
  });

  it("paid list rows have no paid-cancel; unpaid Cancel stays checkout_cancel_unpaid", () => {
    const src = readFileSync(join(WEB_ROOT, "../../app/pages/bookings.dc.html"), "utf8");
    expect(src).toContain('onCancel="{{ cancelUnpaid }}"');
    expect(src).toContain("/api/account/bookings/cancel");
    expect(src).toContain("cancelUnpaid");
    expect(src).not.toContain("/api/account/bookings/paid-cancel");
    expect(src).not.toContain("Confirm cancellation");
  });
});
