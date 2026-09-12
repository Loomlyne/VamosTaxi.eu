// apps/web/lib/lifecycle/reminder.test.ts
//
// 09-01 Wave 0 + 09-07: 24h reminder = notifyReminder24h (claim-then-send).
// Skip cancelled/completed/no_show (D-29). Clock vs original pickup (Europe/Zurich).
// SQL window is a 1-hour bucket 24h ahead of a fixed Instant. No sleep. No live Resend.
// No TRIP. No LX1234.

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
  it("uses notifyReminder24h (notification_claim then Resend then notification_settle)", () => {
    const src = read("apps/web/lib/lifecycle/reminder.ts");
    expect(src).toContain("notifyReminder24h");
    expect(src).toMatch(/asSystem/);
    const notify = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    const claimAt = notify.indexOf("notification_claim");
    const settleAt = notify.indexOf("notification_settle");
    const resendAt = Math.max(
      notify.indexOf("Resend"),
      notify.indexOf("sendReminder"),
      notify.indexOf("RESEND"),
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
    const whereBlock = src.slice(src.indexOf("original_scheduled_at"));
    expect(whereBlock).not.toMatch(/l\.scheduled_at\s*[<>=]/);
  });
});

describe("hourly worker (LIFE-05 / LIFE-07)", () => {
  it("calls expireUnpaidBookings then runReminder24h; no no-show sweep", () => {
    const worker = read("apps/web/worker.ts");
    const expireAt = worker.indexOf("expireUnpaidBookings");
    const reminderAt = worker.indexOf("runReminder24h");
    expect(expireAt).toBeGreaterThan(-1);
    expect(reminderAt).toBeGreaterThan(-1);
    expect(expireAt).toBeLessThan(reminderAt);
    expect(worker).toContain("0 3 * * *");
    expect(worker).not.toMatch(/noShow/);
    expect(worker).not.toMatch(/no_show_sweep/);
    expect(worker).not.toMatch(/sweepNoShow/);
  });
});

describe("reminder24hWindow", () => {
  it("builds a 1-hour window 24h ahead of a fixed Instant", async () => {
    const { reminder24hWindow } = await import("./reminder");
    const at = new Date("2026-09-12T10:00:00.000Z");
    expect(reminder24hWindow(at)).toEqual({
      fromIso: "2026-09-13T10:00:00.000Z",
      toIso: "2026-09-13T11:00:00.000Z",
    });
  });

  it("stays on the Instant, not Cloudflare cron TZ", async () => {
    const { reminder24hWindow } = await import("./reminder");
    const winter = new Date("2026-01-12T10:00:00.000Z");
    expect(reminder24hWindow(winter)).toEqual({
      fromIso: "2026-01-13T10:00:00.000Z",
      toIso: "2026-01-13T11:00:00.000Z",
    });
  });
});
