// apps/web/lib/ops/class-change-customer-line.test.ts
//
// 26.2 P1: the customer's booking page after a CHEAPER class change (the admin owes the difference,
// "Refund due"). Until the refund is sent the page shows the owner-approved line, word for word in
// four languages (.planning/decisions/2026-10-01-class-change-pay-mail.md, section "Refund line on the
// customer's booking page", signed 2026-10-01); it disappears once the refund is sent. The cancel line
// "Full refund · sent by our team" is never shown on a trip that still runs.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const ticketSrc = readFileSync(join(root, "app/vamos-manage-ticket.js"), "utf8");
const dictSrc = readFileSync(join(root, "app/vamos-i18n-dict.js"), "utf8");
const decision = readFileSync(join(root, ".planning/decisions/2026-10-01-class-change-pay-mail.md"), "utf8");

type Lang = "en" | "de" | "fr" | "ar";
type Ticket = {
  refundLine: (b: Record<string, unknown>) => string;
  changeCreditLine: (b: Record<string, unknown>) => string;
};

/** The approved line per language from the decision file's second section. */
function approved(lang: Lang): string {
  const section = decision.slice(decision.indexOf("# Refund line on the customer's booking page"));
  const title = { en: "English", de: "German", fr: "French", ar: "Arabic" }[lang];
  const block = section.slice(section.indexOf(`## ${title}`));
  const m = block.match(/^- Line: (.+)$/m);
  expect(m, `${lang} line`).not.toBeNull();
  return m![1]!.trim();
}

/** The real dictionary and ticket helper in a bare window; money stubbed when asked. */
function load(lang: Lang, money?: (a: string) => string): Ticket {
  const win: Record<string, unknown> = {};
  new Function("window", dictSrc)(win);
  const strings = (win.VamosI18n as { strings: Record<string, Record<string, string>> }).strings;
  win.VamosLocale = {
    t: (en: string) => (lang === "en" ? en : (strings[en]?.[lang] ?? en)),
    money: money ?? ((a: string) => `CHF ${a}`),
  };
  new Function("window", ticketSrc)(win);
  return win.VamosManageTicket as Ticket;
}

const credit = {
  status: "confirmed",
  refundStatus: "pending_ops",
  refundOwedRappen: 300,
  refundedRappen: 0,
  money: { className: "Economy" },
};

describe("the refund line after a cheaper class change (owner-approved, 2026-10-01)", () => {
  it.each(["en", "de", "fr", "ar"] as const)("%s reads word for word as approved", (lang) => {
    const { changeCreditLine } = load(lang, () => "CHF 000");
    expect(changeCreditLine(credit)).toBe(approved(lang));
  });

  it("the amount is what is still due (owed minus refunded) through the money formatter", () => {
    const { changeCreditLine } = load("en");
    expect(changeCreditLine({ ...credit, refundOwedRappen: 1300, refundedRappen: 1000 })).toBe(
      "Your trip now runs in Economy. The difference of CHF 3.00 comes back to the payment method you used; our team sends it.",
    );
  });

  it("shows while the refund is not sent (due, being sent, failed) and not after", () => {
    const { changeCreditLine } = load("en");
    for (const refundStatus of ["pending_ops", "processing", "failed"]) {
      expect(changeCreditLine({ ...credit, refundStatus })).not.toBe("");
    }
    expect(changeCreditLine({ ...credit, refundStatus: "none" })).toBe("");
    expect(changeCreditLine({ ...credit, refundedRappen: 300 })).toBe("");
  });

  it("never on a cancelled trip, and never without the class name", () => {
    const { changeCreditLine } = load("en");
    expect(changeCreditLine({ ...credit, status: "cancelled" })).toBe("");
    expect(changeCreditLine({ ...credit, money: null })).toBe("");
  });
});

describe("the customer's Refund row and a change credit", () => {
  const { refundLine } = load("en");

  it("a trip that still runs shows no cancel promise for a change credit", () => {
    expect(refundLine({ status: "confirmed", refundStatus: "pending_ops", refundOwedRappen: 300 })).toBe("");
    expect(refundLine({ status: "assigned", refundStatus: "pending_ops", refundOwedRappen: 300 })).toBe("");
  });

  it("a cancelled trip keeps the approved cancel line", () => {
    expect(refundLine({ status: "cancelled", refundStatus: "pending_ops", refundOwedRappen: 300 })).toBe("Full refund · sent by our team");
    expect(refundLine({ status: "cancelled", refundStatus: "pending_ops", refundOwedRappen: 0 })).toBe("Refund under review");
    expect(refundLine({ status: "cancelled", refundStatus: "refunded" })).toBe("Refunded");
  });
});

describe("both customer booking pages show the line next to the trip status", () => {
  it.each(["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"])("%s", (rel) => {
    const page = readFileSync(join(root, rel), "utf8");
    expect(page).toMatch(/sc-if value="\{\{ changeCredit \}\}"/);
    expect(page).toMatch(/data-vt-no-i18n="1">\{\{ changeCreditLine \}\}</);
    expect(page).toMatch(/helper\.changeCreditLine \? helper\.changeCreditLine\(ticket\) : ''/);
  });

  it("the account path carries what was already refunded", () => {
    const route = readFileSync(join(root, "apps/web/app/api/account/bookings/details/route.ts"), "utf8");
    expect(route).toMatch(/b\.refunded_rappen/);
    expect(route).toMatch(/refundedRappen: payload\.refundedRappen/);
    expect(ticketSrc).toMatch(/booking\.refundedRappen = Number\(d\.body\.refundedRappen\) \|\| 0;/);
  });
});
