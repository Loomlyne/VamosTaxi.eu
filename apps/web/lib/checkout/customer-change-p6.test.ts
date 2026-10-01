// apps/web/lib/checkout/customer-change-p6.test.ts
//
// 26.2 P6, owner decisions D12, D13, D15 (.planning/decisions/2026-10-01-p6-paid-trip-edit.md):
//   D12  the cancel view's "Move it instead" box loses its sentence ("Keep the booking and the fare
//        where they are, and pick another day, another route or a different vehicle.") on both
//        customer views and in the dictionary; the box keeps its title and button.
//   D13  on the signed-in account booking view "Request these changes" sends the time change exactly
//        as the manage-booking page does (the account route when signed in, the guest route with the
//        manage token; the same result states). It used to show "Change requested" and send nothing.
//   D15  after a CHEAPER change of places or time, until the refund is sent, the booking page shows
//        the owner's line word for word in four languages; a class-only cheaper change keeps P1's line.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { moneyFromJson } from "./manage-money";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];
const SENTENCE = "Keep the booking and the fare where they are, and pick another day, another route or a different vehicle.";
const dictSrc = read("app/vamos-i18n-dict.js");
const ticketSrc = read("app/vamos-manage-ticket.js");
const decision = read(".planning/decisions/2026-10-01-p6-paid-trip-edit.md");

type Lang = "en" | "de" | "fr" | "ar";

describe("D12: the 'Move it instead' sentence is gone, the box stays", () => {
  it.each(PAGES)("%s", (rel) => {
    const html = read(rel);
    expect(html).not.toContain(SENTENCE);
    expect(html).toMatch(/<span data-fork-t="1">Move it instead<\/span><\/span>/);
    expect(html).toMatch(/<span data-fork-cta="ghost">Change instead/);
  });
  it("the dictionary no longer carries the sentence; the title keeps its four languages", () => {
    expect(dictSrc).not.toContain(SENTENCE);
    expect(dictSrc).toMatch(/'Move it instead': \{ de: 'Lieber verschieben', fr: 'Déplacer plutôt', ar: '[^']+' \}/);
  });
});

/** The confirmModify handler of a page, as text. */
function confirmModify(html: string): string {
  const a = html.indexOf("confirmModify = () => {");
  expect(a).toBeGreaterThan(-1);
  const b = html.indexOf("\n  };", a);
  return html.slice(a, b);
}

describe("D13: the account view sends the time change as the manage-booking page does", () => {
  it.each(PAGES)("%s: the account route when signed in, the guest route with the token, the same states", (rel) => {
    const body = confirmModify(read(rel));
    expect(body).toMatch(/this\.state\.authVia === 'account'/);
    expect(body).toMatch(/helper\.timeChangeAccount\(ticket\.reference, scheduledLocal\)/);
    expect(body).toMatch(/helper\.timeChangeGuest\(tok, ticket\.reference, scheduledLocal\)/);
    expect(body).toMatch(/t\('Time-change requested\. Pickup stays \{original\} until we confirm\.'\)/);
    expect(body).toMatch(/t\('Could not request this time change\.'\)/);
    expect(body).not.toMatch(/ticket\.via/);
  });

  it("the account view no longer says 'Change requested' without sending anything", () => {
    const html = read("app/pages/booking-detail.dc.html");
    expect(html).not.toContain("Change requested. We confirm every change by email.");
    expect(confirmModify(html)).toMatch(/req\.then\(/);
  });

  it("the account path is the one the loader names (manage-ticket helper: via 'account')", () => {
    expect(ticketSrc).toMatch(/return \{ kind: "booking", booking: booking, via: "account" \};/);
    expect(ticketSrc).toMatch(/function timeChangeAccount\(ref, scheduledLocal\)/);
  });
});

/** The approved D15 line per language from the decision file. */
function d15(lang: Lang): string {
  const block = decision.slice(decision.indexOf("### D15"));
  const title = { en: "English", de: "German", fr: "French", ar: "Arabic" }[lang];
  const m = block.match(new RegExp(`^- ${title}: (.+)$`, "m"));
  expect(m, `${lang} line`).not.toBeNull();
  return m![1]!.trim();
}

function load(lang: Lang, money?: (a: string) => string) {
  const win: Record<string, unknown> = {};
  new Function("window", dictSrc)(win);
  const strings = (win.VamosI18n as { strings: Record<string, Record<string, string>> }).strings;
  win.VamosLocale = {
    t: (en: string) => (lang === "en" ? en : (strings[en]?.[lang] ?? en)),
    money: money ?? ((a: string) => `CHF ${a}`),
  };
  new Function("window", ticketSrc)(win);
  return win.VamosManageTicket as { changeCreditLine: (b: Record<string, unknown>) => string };
}

const credit = {
  status: "confirmed",
  refundStatus: "pending_ops",
  refundOwedRappen: 300,
  refundedRappen: 0,
  money: { className: "Economy", lastChange: "trip" },
};

describe("D15: the refund line after a cheaper change of places or time", () => {
  it.each(["en", "de", "fr", "ar"] as const)("%s reads word for word as approved", (lang) => {
    const { changeCreditLine } = load(lang, () => "CHF 000");
    expect(changeCreditLine(credit)).toBe(d15(lang));
  });

  it("a class-only cheaper change keeps P1's line; no change recorded keeps P1's line too", () => {
    const { changeCreditLine } = load("en", () => "CHF 000");
    expect(changeCreditLine({ ...credit, money: { className: "Economy", lastChange: "class" } })).toMatch(/^Your trip now runs in Economy\./);
    expect(changeCreditLine({ ...credit, money: { className: "Economy" } })).toMatch(/^Your trip now runs in Economy\./);
  });

  it("gone once the refund is sent, never on a cancelled trip", () => {
    const { changeCreditLine } = load("en");
    expect(changeCreditLine({ ...credit, refundStatus: "none" })).toBe("");
    expect(changeCreditLine({ ...credit, refundedRappen: 300 })).toBe("");
    expect(changeCreditLine({ ...credit, status: "cancelled" })).toBe("");
  });

  it("the amount is what is still due, through the money formatter", () => {
    const { changeCreditLine } = load("en", (a) => `money(${a})`);
    expect(changeCreditLine({ ...credit, refundOwedRappen: 1300, refundedRappen: 1000 })).toBe(
      "Your trip has changed. The difference of money(3.00) comes back to the payment method you used; our team sends it.",
    );
  });

  it("the booking's money block names the last change (manage_money_for.last_change)", () => {
    expect(moneyFromJson({ charged_rappen: 1000, lines: [], vehicle_class_name: "Economy", last_change: "trip" })).toMatchObject({ lastChange: "trip" });
    expect(moneyFromJson({ charged_rappen: 1000, lines: [], vehicle_class_name: "Economy", last_change: "class" })).toMatchObject({ lastChange: "class" });
    expect(moneyFromJson({ charged_rappen: 1000, lines: [], vehicle_class_name: "Economy" })).toMatchObject({ lastChange: null });
    expect(moneyFromJson({ charged_rappen: 1000, lines: [], vehicle_class_name: "Economy", last_change: "x" })).toMatchObject({ lastChange: null });
  });
});

// D13 found on the way: both views sent the time on the day AS BOOKED (a new day was dropped), and a
// booking opened through the account had no day at all, so its request was refused. The day picked
// in the date picker now travels with the time, and an account booking carries its day.
function helpers(rel: string) {
  const html = read(rel);
  const a = html.indexOf("function isoDay(");
  const b = html.indexOf("\n}\n", html.indexOf("function requestedLocal(")) + 2;
  expect(a).toBeGreaterThan(-1);
  return new Function(`${html.slice(a, b)}\nreturn { requestedLocal, isoDay };`)() as {
    requestedLocal: (iso: string, time: string, booked: string) => string;
    isoDay: (y: unknown, m: unknown, d: unknown) => string;
  };
}

describe.each(PAGES)("%s: the day picked is sent with the time", (rel) => {
  const h = helpers(rel);
  const html = read(rel);

  it("the picker's day (month 0-based) becomes the ISO day", () => {
    expect(h.isoDay(2026, 9, 9)).toBe("2026-10-09");
    expect(h.isoDay(undefined, undefined, 9)).toBe("");
  });

  it("a new day and time, the booked day with a new time, nothing without a day", () => {
    expect(h.requestedLocal("2026-10-09", "10:00", "2026-10-08T08:00")).toBe("2026-10-09T10:00");
    expect(h.requestedLocal("", "10:00", "2026-10-08T08:00")).toBe("2026-10-08T10:00");
    expect(h.requestedLocal("", "10:00", "")).toBe("");
    expect(h.requestedLocal("Fri 9 Oct", "10:00", "")).toBe("");
  });

  it("setDay keeps the ISO day; the request is built from it; nothing is sent without one", () => {
    expect(html).toMatch(/setDay = \(d, label, y, m\) => this\.setState\(\(s\) => \(\{ mDay: d, mDate: label, mIso: isoDay\(y, m, d\) \|\| s\.mIso \}\)\);/);
    const body = confirmModify(html);
    expect(body).toMatch(/const scheduledLocal = requestedLocal\(s\.mIso, s\.mTime, ticket\.scheduledLocal\);/);
    expect(body).toMatch(/if \(!scheduledLocal\) \{ this\.say\(t\('Could not request this time change\.'\), 'danger'\); return; \}/);
  });
});

it("an account booking carries its day (dateIso on the account list, scheduledLocal on the ticket)", async () => {
  const { mapAccountBooking } = await import("../account/bookings");
  expect(mapAccountBooking({ reference: "VT-1", status: "confirmed", scheduled_local: "2026-10-08T08:00" } as never)).toMatchObject({
    dateIso: "2026-10-08", time: "08:00",
  });
  expect(ticketSrc).toMatch(/scheduledLocal: row && row\.dateIso && row\.time \? row\.dateIso \+ "T" \+ row\.time : "",/);
});

// D19 (owner, 2026-10-01): on the signed-in booking view, "Save" of the flight number and "Resend
// email" do the real thing, as on the manage-booking link: the account route when the booking was
// opened signed in, the guest route with the manage token; the same result states and an error
// state when it fails. Resend had no server path on either view (both said "Sent" and sent nothing):
// POST /api/manage/resend and /api/account/bookings/resend now send the confirmation again.
function handler(html: string, name: string): string {
  const a = html.indexOf(`  ${name} = () => {`);
  expect(a, name).toBeGreaterThan(-1);
  const b = html.indexOf("\n  };", a);
  return html.slice(a, b);
}

describe.each(PAGES)("%s: D19 flight number and resend do the real thing", (rel) => {
  const html = read(rel);

  it("Save of the flight number goes to the server and says what happened", () => {
    const body = handler(html, "saveFlight");
    expect(body).toMatch(/this\.state\.authVia === 'account'\s*\? helper\.saveFlightAccount\(ticket\.reference, v\)\s*: helper\.saveFlightGuest\(tok, ticket\.reference, v\)/);
    expect(body).toMatch(/this\.say\(t\('Flight number saved\.'\), 'success'\)/);
    expect(body).toMatch(/this\.say\(t\('Could not save this flight number\.'\), 'danger'\)/);
    expect(html).not.toContain("Your driver tracks this flight.");
  });

  it("Resend email goes to the server; success names the address, failure says so", () => {
    const body = handler(html, "resend");
    expect(body).toMatch(/this\.state\.authVia === 'account'\s*\? helper\.resendAccount\(ticket\.reference\)\s*: helper\.resendGuest\(tok, ticket\.reference\)/);
    expect(body).toMatch(/this\.say\('Sent\. Check ' \+ /);
    expect(body).toMatch(/this\.say\(t\('Could not send that request\.'\), 'danger'\)/);
    expect(body).toMatch(/req\.then\(/);
  });
});

describe("D19: the account view carries the flight number, so its Save row shows as on the manage link", () => {
  it("the account list reads the flight number and the ticket keeps it", async () => {
    const { mapAccountBooking } = await import("../account/bookings");
    expect(mapAccountBooking({ reference: "VT-1", status: "confirmed", scheduled_local: "2026-10-08T08:00", flight_no: "LX 318" } as never)).toMatchObject({ flightNo: "LX 318" });
    expect(mapAccountBooking({ reference: "VT-1", status: "confirmed", scheduled_local: "2026-10-08T08:00" } as never)).toMatchObject({ flightNo: "" });
    expect(read("apps/web/app/api/account/bookings/route.ts")).toMatch(/l\.flight_no,/);
    expect(ticketSrc).toMatch(/flightNo: \(row && row\.flightNo\) \|\| "",/);
  });

  it("the account view names the address the confirmation goes to (the Resend row read 'Send it again to ,')", async () => {
    const { mapAccountBooking } = await import("../account/bookings");
    expect(mapAccountBooking({ reference: "VT-1", status: "confirmed", scheduled_local: "2026-10-08T08:00", contact_email: "anna@example.test" } as never)).toMatchObject({ contactEmail: "anna@example.test" });
    expect(read("apps/web/app/api/account/bookings/route.ts")).toMatch(/b\.contact_email,/);
    expect(ticketSrc).toMatch(/contactEmail: \(row && row\.contactEmail\) \|\| "",/);
  });
});

describe("D19: the manage-ticket helper and the dictionary", () => {
  it("the helper posts to the two resend routes", () => {
    expect(ticketSrc).toMatch(/function resendGuest\(tok, ref\) \{\s*return jsonFetch\("\/api\/manage\/resend"/);
    expect(ticketSrc).toMatch(/function resendAccount\(ref\) \{\s*return jsonFetch\("\/api\/account\/bookings\/resend"/);
    expect(ticketSrc).toMatch(/resendGuest: resendGuest,\s*resendAccount: resendAccount,/);
  });
  it("the success line exists in four languages (pattern), the failure line already did", () => {
    expect(dictSrc).toMatch(/re: \/\^Sent\\\. Check \(\.\+\) in a minute or two\\\.\$\//);
    expect(dictSrc).toMatch(/'Could not send that request\.': \{ de: '(?:[^'\\]|\\.)+', fr: '(?:[^'\\]|\\.)+', ar: '(?:[^'\\]|\\.)+' \}/);
    expect(dictSrc).toMatch(/'Flight number saved\.': \{ de: /);
  });
});
