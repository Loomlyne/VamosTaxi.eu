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
      "sendRefundFailed",
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

  it("dedupe kinds match cancellation, refund_failed, reminder_24h, assignment_customer, time_change, flight_no, review_request", () => {
    const src = read("apps/web/lib/lifecycle/notify-lifecycle.ts");
    for (const kind of [
      "cancellation",
      "refund_failed",
      "reminder_24h",
      "assignment_customer",
      "time_change",
      "flight_no",
      "review_request",
    ]) {
      expect(src).toContain(kind);
    }
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
