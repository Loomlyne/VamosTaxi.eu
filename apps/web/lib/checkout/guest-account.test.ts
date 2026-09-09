import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

const REPO = join(WEB_ROOT, "..", "..");

describe("07-14 guest + finish payment", () => {
  it("account Finish payment reads vamosTrip lock", () => {
    const src = readFileSync(join(REPO, "app/pages/account.dc.html"), "utf8");
    expect(src).toContain("Finish payment");
    expect(src).toContain("href=\"/checkout/payment\"");
    expect(src).toContain("vamosTrip");
  });

  it("manage-booking unpaid copy exists", () => {
    const src = readFileSync(join(REPO, "app/pages/manage-booking.dc.html"), "utf8");
    expect(src).toContain("Not paid yet");
    expect(src).toContain("unpaid");
  });
});
