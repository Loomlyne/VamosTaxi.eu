// apps/web/lib/checkout/customer-change-time-only.test.ts
//
// 26.2 P6, owner decision D9 (.planning/quick/261001-p6-paid-trip-edit/DECISIONS.md): the customer's
// "Change your booking" view showed pickup, destination, class, passengers and bags, then sent only
// the time. The five fields go, with the sentences that only made sense with them (removed, not
// rewritten); the time change stays. Same view on the manage link and the account booking view.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];
const RETIRED = [
  "Move the pickup, change where you are going, or travel with a different party.",
  "Where you are going",
  "A new route is priced again.",
  "A larger class costs more and a smaller one costs less.",
  "Passengers and bags",
  "That is more people than this class seats.",
  "Count a cabin bag as a bag.",
  "You pay any difference in the fare, or we refund it.",
  "Time, route, vehicle or passengers.",
];

function modifyView(html: string): string {
  const a = html.indexOf('<sc-if value="{{ isModify }}"');
  const b = html.indexOf('<sc-if value="{{ isBlocked }}"', a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return html.slice(a, b);
}

describe.each(PAGES)("%s: the change view offers the time only (D9)", (rel) => {
  const html = read(rel);
  const view = modifyView(html);

  it("has no pickup, destination, class, passengers or bags control", () => {
    expect(view).not.toMatch(/mb-pickup|mb-dropoff|pickupDraft|dropoffDraft/);
    expect(view).not.toMatch(/data-opts|\{\{ vehicles \}\}|paxInc|paxDec|bagInc|bagDec|overCapacity/);
    expect(html).not.toMatch(/onPickupDraft|onDropoffDraft|pickVehicle|const CLASSES = \[/);
  });

  it("keeps the date and time picker and the request button", () => {
    expect(view).toMatch(/<dc-import name="WhenPicker"/);
    expect(view).toMatch(/onClick="\{\{ confirmModify \}\}"/);
  });

  it("lists and sends the time only", () => {
    const diff = html.slice(html.indexOf("  diffList() {"), html.indexOf("  say(msg, tone) {"));
    expect(diff).toMatch(/out\.push\(\{ k: 'Pickup time'/);
    expect(diff).not.toMatch(/Pickup address|Destination|Passengers|Bags/);
    const send = html.slice(html.indexOf("  confirmModify = () => {"), html.indexOf("  confirmCancel = () => {"));
    expect(send).not.toMatch(/pickupDraft|dropoffDraft|s\.pax|s\.bags|s\.vehicle/);
    // The manage link sends the time; the account view's button sends nothing today (follow-up in DESIGN-DRAFT.md).
    if (rel.includes("manage-booking")) {
      expect(send).toMatch(/timeChangeAccount\(ticket\.reference, scheduledLocal\)/);
      expect(send).toMatch(/timeChangeGuest\(tok, ticket\.reference, scheduledLocal\)/);
    }
  });

  it("no sentence that only made sense with the five fields is left", () => {
    for (const s of RETIRED) expect(html, s).not.toContain(s);
    expect(view).toContain("Nothing is applied until we confirm it in writing.");
    expect(view).toContain("We never charge for the change itself.");
    expect(html).toContain("'We confirm every change by email before it counts.'");
  });
});

describe("dictionary", () => {
  const dict = read("app/vamos-i18n-dict.js");

  it("the retired strings are gone", () => {
    for (const s of RETIRED) expect(dict, s).not.toContain(`'${s}`);
  });

  it("the sentences that stay exist in de, fr and ar (cut from their existing translations)", () => {
    for (const key of [
      "Nothing is applied until we confirm it in writing.",
      "We never charge for the change itself.",
      "We confirm every change by email before it counts.",
      "Back to your booking",
      "New pickup date & time",
    ]) {
      const line = dict.split("\n").find((l) => l.trim().startsWith(`'${key}': {`)) ?? "";
      expect(line, key).toMatch(/de: '[^']+', fr: '[^']+', ar: '[^']+'/);
      expect(line, key).not.toContain("ß");
    }
  });
});
