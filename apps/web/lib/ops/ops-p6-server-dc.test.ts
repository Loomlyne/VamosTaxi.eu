// apps/web/lib/ops/ops-p6-server-dc.test.ts
//
// 26.2 P6 server step: the two places the dashboard Edit had to follow the server
// (app/ops/OpsDetail.dc.html), with no new text — only strings the page already has in four
// languages:
//   - the refusals the change route can still answer show the page's own sentence instead of the
//     generic "Could not change the trip of …" (Keep refused for a car from before 2026-10-01; a new airport
//     pickup without a flight; a time that has passed);
//   - "<driver> stays on the trip and gets the new details by e-mail" shows only when the server
//     sends him one: new places ("trip assigned" again) or a new time (time-change e-mail), D16. A
//     change of passengers or bags alone sends him nothing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dc = readFileSync(join(here, "../../../../app/ops/OpsDetail.dc.html"), "utf8");

describe("OpsDetail follows the change route's answers (26.2 P6)", () => {
  it("named refusals map to sentences the page already has", () => {
    expect(dc).toMatch(/'must-fix': t\.mustFix, 'driver-overlap': t\.mustFix, 'flight-needed': t\.flightNeeded, 'past-time': t\.errPastTime,/);
    for (const key of ["mustFix", "flightNeeded", "errPastTime"]) {
      expect(dc.match(new RegExp(`\\b${key}:'`, "g"))?.length, key).toBe(4);
    }
  });

  it("the kept driver's note shows only for new places or a new time (D16)", () => {
    expect(dc).toMatch(/driverNoteShown: tripReady && hasDriver && !classChanged && !clash && \(placesChanged \|\| tf\.whenChanged\),/);
    expect(dc).toMatch(/confirmDriverShown: hasDriver && !classChanged && \(placesChanged \|\| tf\.whenChanged\) && \(!clash \|\| clashChoice === 'keep'\),/);
  });

  it("after confirm the page names the e-mail the server reports (driverUpdated / driverTakenOff)", () => {
    expect(dc).toMatch(/if \(d\.driverTakenOff\) msg \+= ' ' \+ t\.classDoneDriver;/);
    expect(dc).toMatch(/else if \(d\.driverUpdated && driverName\) msg \+= ' ' \+ fillName\(t\.tripDoneDriverKept\);/);
  });
});

describe("Phase 31 (refunds in Stripe): a cheaper class or trip change is refunded in Stripe", () => {
  // Replaces the D21 (2026-10-02) Refund due credit box: the dashboard no longer sends the difference itself.
  const NOTES: Record<"classNoteCheaper" | "tripNoteCheaper", string[]> = {
    classNoteCheaper: [
      "The class changes when you confirm. Refund the difference in Stripe afterwards.",
      "Die Klasse ändert sich, wenn Sie bestätigen. Erstatten Sie die Differenz danach in Stripe.",
      "La classe change dès votre confirmation. Remboursez ensuite la différence dans Stripe.",
      "تتغيّر الفئة عند تأكيدك. استرد الفرق بعد ذلك في Stripe.",
    ],
    tripNoteCheaper: [
      "The trip changes when you confirm. Refund the difference in Stripe afterwards.",
      "Die Fahrt ändert sich, wenn Sie bestätigen. Erstatten Sie die Differenz danach in Stripe.",
      "Le trajet change dès votre confirmation. Remboursez ensuite la différence dans Stripe.",
      "تتغيّر الرحلة عند تأكيدك. استرد الفرق بعد ذلك في Stripe.",
    ],
  };

  it("the confirm step's note says to refund the difference in Stripe, in four languages", () => {
    for (const [key, texts] of Object.entries(NOTES)) {
      expect(dc.match(new RegExp(`\\b${key}:'`, "g"))?.length, key).toBe(4);
      for (const text of texts) expect(dc, `${key}: ${text}`).toContain(`${key}:'${text}'`);
    }
  });

  it("the toast after the change names the difference and says to refund it in Stripe", () => {
    expect(dc).toContain("classDoneRefund:'Class changed. Difference to refund: {a}. Refund it in Stripe.'");
    expect(dc).toContain("tripDoneRefund:'Trip changed. Difference to refund: {a}. Refund it in Stripe.'");
  });

  it("the credit box and its copy are gone", () => {
    expect(dc).not.toMatch(/\b(?:trip|class)CreditBody:'/);
    expect(dc).not.toMatch(/\bt\.(?:trip|class)CreditBody\b/);
    expect(dc).not.toMatch(/tClassCreditBody|tRefundBody|const tripCredit\b/);
  });
});
