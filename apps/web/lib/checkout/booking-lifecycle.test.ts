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
      stops: 0,
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

  it("lists unpaid pending rows and hides quote shells", () => {
    expect(accountListIncludesStatus("quote")).toBe(false);
    expect(accountListIncludesStatus("pending")).toBe(true);
    expect(accountListIncludesStatus("confirmed")).toBe(true);
    expect(accountUiStatus("pending")).toBe("unpaid");
    expect(accountBookingHref("pending", "VT-26-0001")).toBe("/checkout/payment");
    expect(accountBookingHref("confirmed", "VT-26-0001")).toBe("/confirmation/VT-26-0001");
    expect(shouldAbandonUnpaid("pending")).toBe(true);
    expect(shouldAbandonUnpaid("confirmed")).toBe(false);
    expect(UNPAID_TTL_HOURS).toBe(24);
  });
});

describe("home starts a new booking", () => {
  it("wipes vamosTrip on home mount and abandons the previous unpaid row", () => {
    const home = readFileSync(join(WEB_ROOT, "../../app/home/home.dc.html"), "utf8");
    expect(home).toContain("function beginHomeBooking");
    expect(home).toContain("localStorage.removeItem('vamosTrip')");
    expect(home).toContain("sessionStorage.removeItem('vamosTrip')");
    expect(home).toContain("sessionStorage.removeItem('vamosQuoteLock')");
    expect(home).toContain("/api/checkout/abandon");
    expect(home).toContain("beginHomeBooking()");
  });
});

describe("unpaid card cancel + 24h expire", () => {
  it("account cancel uses asCustomer checkout_cancel_unpaid", () => {
    const src = readFileSync(join(WEB_ROOT, "app/api/account/bookings/cancel/route.ts"), "utf8");
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

  it("BookingRow unpaid card has Cancel above the hit overlay", () => {
    const row = readFileSync(join(WEB_ROOT, "../../app/pages/BookingRow.dc.html"), "utf8");
    expect(row).toContain("data-bk-payacts");
    expect(row).toContain("cancelUnpaid");
    expect(row).toContain("Unpaid bookings cancel automatically after 24 hours.");
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
