import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

const REPO = join(WEB_ROOT, "..", "..");

describe("07-14 guest + finish payment", () => {
  it("account Finish payment reads vamosTrip lock", () => {
    const src = readFileSync(join(REPO, "app/pages/account.dc.html"), "utf8");
    const row = readFileSync(join(REPO, "app/pages/BookingRow.dc.html"), "utf8");
    expect(row).toContain("waiting payment");
    expect(row).toContain("finished payment");
    expect(row).not.toContain("Finish payment");
    expect(row).not.toContain("Needs payment");
    expect(src).toContain("vamosTrip");
    expect(src).toContain("cancelCheckout");
    expect(src).not.toContain("data-ac-pay");
    expect(src).not.toContain("<a data-ac-more=\"1\" href=\"/checkout/payment\">");
    expect(src).not.toContain('variant="inset"');
    expect(src).toContain("/api/account/bookings");
    expect(src).toContain("/api/account/prefs");
    expect(src).toContain("pushPrefs");
  });

  it("BookingRow colours confirmed as success, not outline", () => {
    const src = readFileSync(join(REPO, "app/pages/BookingRow.dc.html"), "utf8");
    expect(src).toContain("confirmed: 'success'");
    expect(src).not.toContain("confirmed: 'outline'");
  });

  it("bookings list loads from the account API, not SAMPLE", () => {
    const src = readFileSync(join(REPO, "app/pages/bookings.dc.html"), "utf8");
    expect(src).toContain("/api/account/bookings");
    expect(src).not.toContain("booking-detail.dc.html");
    expect(src).toContain("view: 'loading'");
  });

  it("manage-booking unpaid copy exists", () => {
    const src = readFileSync(join(REPO, "app/pages/manage-booking.dc.html"), "utf8");
    expect(src).toContain("Not paid yet");
    expect(src).toContain("unpaid");
  });
});
