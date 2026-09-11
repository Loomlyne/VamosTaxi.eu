// apps/web/lib/lifecycle/reminder.test.ts
//
// 09-01 Wave 0: 24h reminder = notification_claim then Resend then notification_settle.
// Skip cancelled/completed (D-29). Clock vs original pickup (Europe/Zurich).
// Red until 09-07 lands reminder.ts. No live Resend. No TRIP. No LX1234.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("24h reminder claim-then-send (D-29)", () => {
  it("uses notification_claim then Resend then notification_settle", () => {
    const src = read("apps/web/lib/lifecycle/reminder.ts");
    const claimAt = src.indexOf("notification_claim");
    const settleAt = src.indexOf("notification_settle");
    const resendAt = Math.max(
      src.indexOf("Resend"),
      src.indexOf("sendReminder"),
      src.indexOf("RESEND"),
    );
    expect(claimAt).toBeGreaterThan(-1);
    expect(settleAt).toBeGreaterThan(-1);
    expect(resendAt).toBeGreaterThan(-1);
    expect(claimAt).toBeLessThan(resendAt);
    expect(resendAt).toBeLessThan(settleAt);
  });

  it("skips cancelled and completed (D-29)", () => {
    const src = read("apps/web/lib/lifecycle/reminder.ts");
    expect(src).toMatch(/cancelled/);
    expect(src).toMatch(/completed/);
    expect(src).toMatch(/skip|not in|NOT IN|!==/i);
  });

  it("hours vs original pickup, not shifted scheduled_at", () => {
    const src = read("apps/web/lib/lifecycle/reminder.ts");
    expect(src).toMatch(/original_scheduled_at|original pickup/);
    expect(src).toMatch(/Europe\/Zurich|Zurich/);
  });
});
