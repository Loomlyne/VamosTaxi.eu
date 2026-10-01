// apps/web/lib/ops/ops-p6-edit-dc.test.ts
//
// 26.2 P6 design pins for the dashboard Edit of a paid trip (app/ops/OpsDetail.dc.html), owner
// decisions D1–D8 (.planning/quick/261001-p6-paid-trip-edit/DECISIONS.md). The pure helpers run here
// from the DC source; the markup and the save flow are read as text, like the other OpsDetail pins.
// Pictures: .planning/quick/261001-p6-paid-trip-edit/screens/.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const dc = readFileSync(join(repoRoot, "app/ops/OpsDetail.dc.html"), "utf8");

function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(-1);
  return src.slice(a, b);
}

type Json = Record<string, unknown>;
type Helpers = {
  tripFields: (booking: Json, ed: Json) => Record<string, boolean>;
  instantFields: (booking: Json, ed: Json) => { list: string[]; changed: boolean; flight: boolean };
  tripPreviewBody: (booking: Json, ed: Json) => Json;
};
const helpers = new Function(
  `${between(dc, "function tripFields(", "const T = {")}\nreturn { tripFields, instantFields, tripPreviewBody };`,
)() as Helpers;

const booking = {
  pickup: "Zurich Oerlikon station, 8050 Zurich", dropoff: "Zurich Airport (ZRH)", dateIso: "2026-10-08", time: "08:00",
  pax: 3, bags: 2, flight: "", customer: "Anna Keller", email: "anna@example.com", phone: "+41 79 000 00 00", note: "",
};
const snap = { ...booking, pax: "3", bags: "2", pickupPlace: null, dropoffPlace: null };
const zug = { text: "Zug station, Bahnhofplatz, 6300 Zug", mapbox_id: "mb-zug", session_token: "tok-1" };

describe("what counts as a trip change (places only from the address search)", () => {
  it("nothing changed: an empty preview body (today's classes of the trip as booked)", () => {
    expect(helpers.tripPreviewBody(booking, snap)).toEqual({});
  });

  it("a typed place that was not picked is not a change — it blocks with 'pick from the list'", () => {
    const f = helpers.tripFields(booking, { ...snap, pickup: "Zug" });
    expect(f.pickupTyped).toBe(true);
    expect(f.pickupChanged).toBe(false);
    expect(helpers.tripPreviewBody(booking, { ...snap, pickup: "Zug" })).toEqual({});
    expect(dc).toMatch(/: \(tf\.pickupTyped \|\| tf\.dropoffTyped \? t\.pickFromList/);
  });

  it("a picked place goes to the preview as the quote's retrieve input, nothing else", () => {
    const body = helpers.tripPreviewBody(booking, { ...snap, pickup: zug.text, pickupPlace: zug });
    expect(body).toEqual({ pickup: { kind: "retrieve", mapbox_id: "mb-zug", session_token: "tok-1", text: zug.text } });
  });

  it("date and time travel together; passengers and bags only when valid (1–16, 0–16)", () => {
    expect(helpers.tripPreviewBody(booking, { ...snap, time: "10:00" })).toEqual({ dateIso: "2026-10-08", time: "10:00" });
    expect(helpers.tripPreviewBody(booking, { ...snap, time: "25:00" })).toEqual({});
    expect(helpers.tripFields(booking, { ...snap, time: "25:00" }).timeBad).toBe(true);
    expect(helpers.tripPreviewBody(booking, { ...snap, pax: "6" })).toEqual({ pax: 6 });
    expect(helpers.tripFields(booking, { ...snap, pax: "0" }).paxBad).toBe(true);
    expect(helpers.tripFields(booking, { ...snap, pax: "" }).paxBad).toBe(true);
    expect(helpers.tripFields(booking, { ...snap, bags: "17" }).bagsBad).toBe(true);
  });

  it("the instant fields are name, e-mail, phone, note and flight (D6, D8)", () => {
    const i = helpers.instantFields(booking, { ...snap, phone: "+41 79 000 00 01", flight: "LX 320" });
    expect(i.list).toEqual(["flight", "phone"]);
    expect(i.flight).toBe(true);
    expect(helpers.instantFields(booking, snap).changed).toBe(false);
  });
});

describe("saving: the PATCH carries only what is saved at once; the trip goes through its confirm step", () => {
  const save = between(dc, "      saveEdit: () => {", "      markRefund:");
  const patch = between(save, "client.request('PATCH'", "}).then");

  it("PATCH sends name, e-mail, phone, note and flight — never places, date, time, party or class", () => {
    for (const key of ["customer", "email", "phone", "note", "flight"]) expect(patch).toMatch(new RegExp(`\\b${key}:`));
    for (const key of ["pickup", "dropoff", "dateIso", "time", "pax", "bags", "klass"]) expect(patch).not.toMatch(new RegExp(`\\b${key}:`));
  });

  it("a trip change opens the confirm step; a blocked one says why instead", () => {
    expect(save).toMatch(/if \(tripChanged && !this\._classConfirmed\) \{\n\s+if \(tripBlock\) \{ this\.notify\(tripBlock\); return; \}\n\s+this\.setState\(\{ classConfirmOpen: true \}\);/);
  });

  it("the bar's primary reads Save changes for the contact only, Continue for a trip change", () => {
    expect(dc).toMatch(/tEditPrimary: tripChanged \? t\.continue : t\.saveEdit,/);
    expect(dc).toMatch(/onClick="\{\{ saveEdit \}\}" hint-size="150px,36px">\{\{ tEditPrimary \}\}/);
  });

  it("the trip goes to …/change with the changed fields, the signed facts and the figures shown", () => {
    const body = between(dc, "const changeBody = () => {", "    const postClassChange");
    expect(body).toMatch(/if \(pickupChanged\) body\.pickup = placeInput\(ed\.pickupPlace\);/);
    expect(body).toMatch(/if \(cpData\.lock\) body\.lock = cpData\.lock;/);
    expect(body).toMatch(/body\.expectTotalRappen = priceRow\.newTotalRappen;/);
    expect(body).toMatch(/if \(clash\) body\.driver = clashChoice === 'off' \? 'unassign' : 'keep';/);
  });
});

describe("the form (D1–D8)", () => {
  const form = between(dc, "<div data-ops-edit data-vt-no-i18n=\"1\">", "<sc-if value=\"{{ viewing }}\" hint-placeholder-val=\"{{ true }}\">\n<div data-ops-pax-grid>");

  it("two groups: the trip, then contact and note", () => {
    expect(form.indexOf('data-ops-edit-group="trip"')).toBeLessThan(form.indexOf('data-ops-edit-group="contact"'));
    const contact = form.slice(form.indexOf('data-ops-edit-group="contact"'));
    expect(contact).toMatch(/Textarea" label="\{\{ tNote \}\}"/);
    for (const v of ["tCustomer", "tEmail", "tMobile"]) expect(contact).toMatch(new RegExp(`label="\\{\\{ ${v} \\}\\}"`));
  });

  it("booking field order: flight (airport pickup only) → pickup → destination → date, time → passengers, bags", () => {
    const at = (s: string) => form.indexOf(s);
    expect(at('<sc-if value="{{ flightShown }}"')).toBeGreaterThan(-1);
    expect(at('<sc-if value="{{ flightShown }}"')).toBeLessThan(at('label="{{ tPickup }}"'));
    expect(at('label="{{ tPickup }}"')).toBeLessThan(at('label="{{ tDropoff }}"'));
    expect(at('label="{{ tDropoff }}"')).toBeLessThan(at('label="{{ tDate }}"'));
    expect(at('label="{{ tDate }}"')).toBeLessThan(at('label="{{ tTime }}"'));
    expect(at('label="{{ tTime }}"')).toBeLessThan(at('label="{{ tPassengers }}"'));
    expect(at('label="{{ tPassengers }}"')).toBeLessThan(at('label="{{ tBagsLabel }}"'));
  });

  it("the box lists each change old → new, then the money or 'no new price' (D1, D5)", () => {
    expect(form).toMatch(/<sc-for list="\{\{ changeRows \}\}" as="c"/);
    expect(form).toMatch(/<sc-if value="\{\{ noPriceShown \}\}"[\s\S]*\{\{ tNoNewPrice \}\}/);
    expect(dc).toMatch(/const priced = placesChanged \|\| classChanged;/);
    expect(dc).toMatch(/noPriceShown: tripReady && !priced/);
  });

  it("a refusal shows under its field and changes nothing (D2)", () => {
    expect(dc).toMatch(/'place-not-served': t\.errPlaceNotServed/);
    expect(dc).toMatch(/const pickupError = fieldError\('pickup'\);/);
    expect(form).toMatch(/label="\{\{ tPickup \}\}"[^>]*error="\{\{ pickupError \}\}"/);
  });

  it("a party too big for the class names it and lists the classes that fit (D4)", () => {
    expect(dc).toMatch(/const partyTooBig = \(tf\.paxChanged \|\| tf\.bagsChanged\) && !!currentClassRow && currentClassRow\.code === 'class-too-small';/);
    expect(dc).toMatch(/fillAmounts\(t\.classesThatFit, \{ list: fitList \}\)/);
  });

  it("an assigned driver stays (D7); a clash asks you to keep him or take him off", () => {
    expect(form).toMatch(/<sc-if value="\{\{ clashShown \}\}"/);
    expect(form).toMatch(/Radio" name="ops-clash" label="\{\{ clashKeepLabel \}\}"/);
    expect(form).toMatch(/Radio" name="ops-clash" label="\{\{ clashOffLabel \}\}"/);
    expect(dc).toMatch(/\|\| \(clash && !clashChoice \? fillName\(t\.clashChoose\) : ''\)/);
  });

  it("after the pickup time the trip fields lock; the contact stays editable (D8)", () => {
    expect(dc).toMatch(/const tripLocked = pickupReached \|\| frozen;/);
    expect(form).toMatch(/label="\{\{ tPickup \}\}"[^>]*disabled="\{\{ tripLocked \}\}"/);
    const contact = form.slice(form.indexOf('data-ops-edit-group="contact"'));
    expect(contact).not.toMatch(/tripLocked/);
  });

  it("design laws: layout only, logical properties, no tint or glow on the new rules", () => {
    const css = between(dc, "/* 26.2 P6: Edit of a paid trip in two groups", "[data-ops-decide-foot]{");
    expect(css).not.toMatch(/yellow|glow|shadow-accent|\bleft:|\bright:/);
    expect(css).toMatch(/\[dir="rtl"\] \[data-ops-chg-arrow\]\{transform:scaleX\(-1\)\}/);
  });
});
