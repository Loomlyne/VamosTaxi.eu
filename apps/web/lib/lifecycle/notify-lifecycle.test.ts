// apps/web/lib/lifecycle/notify-lifecycle.test.ts
//
// 09-06: claim-then-send proofs. bookings@ ops copies, not info@.
// Time confirmed vs refused are distinct keys (D-23).
// Review request links /review?token= forever (D-21).
// No live Resend. No TRIP. No LX1234. No invented CHF.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sendExpired, sendPriceChanged } from "@vamos/emails/confirmation";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("notify-lifecycle claim-then-send", () => {
  it("uses asSystem notification_claim before send, then notification_settle", () => {
    const src = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    expect(src).toMatch(/asSystem/);
    expect(src).toMatch(/force-dynamic/);
    const claimAt = src.indexOf("notification_claim");
    const settleAt = src.indexOf("notification_settle");
    expect(claimAt).toBeGreaterThan(-1);
    expect(settleAt).toBeGreaterThan(claimAt);
    const between = src.slice(claimAt, settleAt);
    expect(between).toMatch(/await send\(/);
    for (const name of [
      "sendCancellation",
      "sendReminder24h",
      "sendAssignmentCustomer",
      "sendTimeChange",
      "sendFlightNumber",
      "sendReviewRequest",
    ]) {
      expect(src).toContain(name);
    }
  });

  it("ops copies use BOOKINGS_OPS_EMAIL / bookings@vamostaxi.site, not SUPPORT_EMAIL or info@", () => {
    const src = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    expect(src).toContain("notification_claim");
    expect(src).toContain("bookings@vamostaxi.site");
    expect(src).toContain("BOOKINGS_OPS_EMAIL");
    expect(src).not.toMatch(/SUPPORT_EMAIL/);
    expect(src).not.toMatch(/info@vamostaxi\.site/);
  });

  it("every kind it claims is allowed by booking_notifications_kind_check (20261012230000)", () => {
    const src = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    const union = src.match(/export type LifecycleKind =([^;]+);/)?.[1] ?? "";
    const kinds = [...union.matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
    expect(kinds.sort()).toEqual(
      ["assignment", "cancellation", "flight_no", "reminder_24h", "review_request", "time_change"],
    );

    const table = read("packages/db/supabase/migrations/20260823000014_payments_refunds.sql");
    const original = table.match(/kind\s+text not null check \(kind in \(([^)]+)\)\)/)?.[1] ?? "";
    const added = read("packages/db/supabase/migrations/20261012230000_notification_kinds.sql")
      .match(/foreach v_kind in array array\[([^\]]+)\]/)?.[1] ?? "";
    const allowed = new Set([...`${original},${added}`.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
    expect(allowed.size).toBe(9);
    for (const kind of kinds) expect(allowed.has(kind), kind).toBe(true);
    expect(allowed.has("assignment_customer")).toBe(false);
    expect(allowed.has("refund_failed")).toBe(false);
  });
});

describe("time confirmed vs refused (D-23)", () => {
  it("uses distinct copy keys", () => {
    const src = read("packages/emails/src/TimeChangeEmail.tsx");
    expect(src).toMatch(/timeChange\.confirmed/);
    expect(src).toMatch(/timeChange\.refused/);
    const en = JSON.parse(read("packages/emails/src/messages/en.json")) as {
      timeChange: Record<string, string>;
    };
    expect(en.timeChange.confirmedSubject).toBeTruthy();
    expect(en.timeChange.refusedSubject).toBeTruthy();
    expect(en.timeChange.confirmedSubject).not.toEqual(en.timeChange.refusedSubject);
  });
});

describe("review request (D-21)", () => {
  it("links /review?token= forever", () => {
    const src = read("packages/emails/src/ReviewRequestEmail.tsx");
    expect(src).toContain("/review?token=");
    expect(src).not.toMatch(/expires in|valid for \d/i);
  });
});

describe("four languages same pass", () => {
  it("covers timeChange, flightNumber, reviewRequest in en/de/fr/ar", () => {
    for (const loc of ["en", "de", "fr", "ar"]) {
      const json = JSON.parse(read(`packages/emails/src/messages/${loc}.json`)) as Record<
        string,
        unknown
      >;
      expect(json.timeChange, loc).toBeTruthy();
      expect(json.flightNumber, loc).toBeTruthy();
      expect(json.reviewRequest, loc).toBeTruthy();
    }
  });
});

describe("send.ts remaining lifecycle exports", () => {
  it("exports sendTimeChange, sendFlightNumber, sendReviewRequest", () => {
    const src = read("packages/emails/src/lib/send.ts");
    expect(src).toContain("sendTimeChange");
    expect(src).toContain("sendFlightNumber");
    expect(src).toContain("sendReviewRequest");
  });
});

describe("D-24 skip-send price-changed and expired", () => {
  it("sendPriceChanged and sendExpired skip-send until owner copy exists", async () => {
    const changed = await sendPriceChanged(
      { RESEND_API_KEY: "re_test" },
      { locale: "en", contactEmail: "ada@example.test", lockedRappen: 8000 },
    );
    const expired = await sendExpired(
      { RESEND_API_KEY: "re_test" },
      { locale: "de", contactEmail: "ada@example.test", lockedRappen: 8000 },
    );
    expect(changed).toEqual({ ok: true, skipped: true });
    expect(expired).toEqual({ ok: true, skipped: true });
    const src = read("packages/emails/src/lib/send.ts");
    expect(src).toContain("sendPriceChanged");
    expect(src).toContain("sendExpired");
    expect(src).toMatch(/export async function sendPriceChanged[\s\S]{0,180}skipped:\s*true/);
    expect(src).toMatch(/export async function sendExpired[\s\S]{0,180}skipped:\s*true/);
  });

  it("packages/emails messages have no invented price-changed English body", () => {
    for (const loc of ["en", "de", "fr", "ar"]) {
      const raw = read(`packages/emails/src/messages/${loc}.json`);
      expect(raw).not.toMatch(/price.?changed/i);
      expect(raw).not.toMatch(/fare has changed/i);
      expect(raw).not.toMatch(/your quote expired/i);
      expect(raw).not.toMatch(/lock has expired/i);
    }
  });

  it("Publish and expire invoke skip-send; is_test unpaid is skipped", () => {
    const publish = read(
      "apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts",
    );
    const expire = read("apps/web/lib/checkout/expire-unpaid.ts");
    const mail = read("apps/web/lib/checkout/lock-mail.ts");
    expect(publish).toMatch(/notifyPriceChangedForUnpaid/);
    expect(expire).toMatch(/notifyExpiredForBookings/);
    expect(mail).toMatch(/sendPriceChanged/);
    expect(mail).toMatch(/sendExpired/);
    expect(mail).toMatch(/is_test/);
    expect(mail).toMatch(/locked_rappen/);
  });
});
