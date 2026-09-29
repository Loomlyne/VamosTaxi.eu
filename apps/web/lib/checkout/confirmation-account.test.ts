import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

describe("signed-in account can open confirmation", () => {
  it("loads the ticket from the session when the manage cookie is missing", () => {
    const page = readFileSync(join(WEB_ROOT, "app/[locale]/confirmation/[ref]/page.tsx"), "utf8");
    const read = readFileSync(join(WEB_ROOT, "lib/checkout/booking-read.ts"), "utf8");
    const status = readFileSync(join(WEB_ROOT, "app/api/checkout/status/[ref]/route.ts"), "utf8");
    expect(page).toContain("customerClaims");
    expect(page).toContain("readBookingForConfirmation");
    expect(page).toContain("raw || claims");
    expect(read).toContain("asCustomer");
    expect(read).toContain("loadCustomerBooking");
    expect(status).toContain("customerClaims");
  });

  it("still hides a guessed VT-ref with no cookie and no session", () => {
    const page = readFileSync(join(WEB_ROOT, "app/[locale]/confirmation/[ref]/page.tsx"), "utf8");
    const client = readFileSync(join(WEB_ROOT, "app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"), "utf8");
    expect(page).toContain('initialPhase: ConfirmationPhase = "hidden"');
    // Facts are only read behind the manage cookie or a session (T-26.3-14-01).
    expect(page).toContain("if (env && (raw || claims))");
    expect(page).toContain("notVisibleTitle");
    expect(client).toContain("notVisibleTitle");
  });
});
