// apps/web/lib/ops/new-trip-intent.test.ts
//
// 260929-nts: the dashboard New trip Save body must pass the strict intent schema. The form is a
// .dc.html mock, so its pure helpers (between the nt:pure markers) are evaluated from the source.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkoutIntentSchema } from "../checkout/intent-schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const source = readFileSync(join(repoRoot, "app/ops/OpsNewTrip.dc.html"), "utf8");
const pure = source.slice(source.indexOf("/* nt:pure:start */"), source.indexOf("/* nt:pure:end */"));

type Helpers = {
  normaliseFlight: (raw: string) => { flight: string; display: string } | null;
  flightKey: (raw: string) => string;
  classChoices: (classes: unknown[]) => { value: string; label: string }[];
  pickClass: (choices: { value: string }[], current: string) => string;
  newTripIntentBody: (input: Record<string, unknown>) => Record<string, unknown>;
};
const h = new Function(`${pure}; return { normaliseFlight, flightKey, classChoices, pickClass, newTripIntentBody };`)() as Helpers;

const input = {
  quoteId: "0b0f5f0e-3f0a-4d6c-9d6e-6f3c1c5b8a11",
  lock: "signed.lock.value",
  klass: "mercedes-benz-v-class",
  extraCodes: ["child-seat"],
  contact: { name: "Test Caller", email: "caller@example.com", phone: "+41790000000" },
  locale: "de",
  currency: "CHF",
  flight: "LX318",
  pickupText: "Zürich Flughafen",
  pickupLoc: { n: "Zürich Flughafen", mapbox_id: "dXJuOm1ieHBvaTo0", session_token: "1b4e28ba-2fa1-11d2-883f-0016d3cca427" },
  dropText: "Bahnhofstrasse, Zürich",
  dropLoc: { n: "Bahnhofstrasse", mapbox_id: "dXJuOm1ieHBvaTo1", session_token: "1b4e28ba-2fa1-11d2-883f-0016d3cca427" },
  when: "2026-10-20T10:00",
  pax: 2,
  bags: 1,
  idem: "9f1d0c2e-1111-4a2b-8c3d-000000000001",
};

describe("OpsNewTrip Save body", () => {
  it("passes the strict checkout intent schema", () => {
    const parsed = checkoutIntentSchema.safeParse(h.newTripIntentBody(input));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.extra_codes).toEqual(["child-seat"]);
      expect(parsed.data.trip.flight).toBe("LX318");
      expect(parsed.data.vehicle_class).toBe("mercedes-benz-v-class");
    }
  });

  it("passes with no flight and no extras, and never sends the old three-code extras", () => {
    const body = h.newTripIntentBody({ ...input, flight: null, extraCodes: [] });
    expect(body).not.toHaveProperty("extras");
    expect(checkoutIntentSchema.safeParse(body).success).toBe(true);
  });

  it("flight rule is the customer form's", () => {
    expect(h.normaliseFlight("lx 318")).toEqual({ flight: "LX318", display: "LX 318" });
    expect(h.normaliseFlight("nonsense flight")).toBeNull();
    expect(h.flightKey("LX 318")).toBe(h.flightKey("lx318"));
  });

  it("class options come from the quote's eligible classes", () => {
    const choices = h.classChoices([
      { slug: "saden", name: "Economy", eligible: true },
      { slug: "mercedes-benz-v-class", name: "Business", eligible: true },
      { slug: "van-luxury", eligible: false },
    ]);
    expect(choices).toEqual([
      { value: "saden", label: "Economy" },
      { value: "mercedes-benz-v-class", label: "Business" },
    ]);
    expect(h.pickClass(choices, "mercedes-benz-v-class")).toBe("mercedes-benz-v-class");
    expect(h.pickClass(choices, "gone")).toBe("saden");
    expect(h.pickClass([], "x")).toBe("");
  });
});

describe("OpsNewTrip source pins", () => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  it("uses the live price book and the server total", () => {
    for (const s of ["/api/checkout/extras", "/api/checkout/price", "/api/quote/reprice", "/api/geo/retrieve", "extra_codes", "Loading extras"]) {
      expect(code).toContain(s);
    }
    expect(code).not.toMatch(/child_seats|extra_stops|oversized_luggage|extras: this\.extras/);
    expect(code).not.toMatch(/Extra stop|Oversized luggage|Child seat/);
    expect(code).not.toMatch(/CHF [1-9]/);
  });
  it("typing a flight never re-quotes", () => {
    const line = code.split("\n").find((l) => l.includes("setFlight: (e)")) ?? "";
    expect(line).not.toMatch(/fireQuote|priceNow/);
  });
  it("display_currency is called, not passed as a function", () => {
    expect(code).toMatch(/VamosLocale\.cur \? window\.VamosLocale\.cur\(\)/);
  });
  it("new strings exist in de, fr and ar", () => {
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    for (const key of ["Optional.", "Loading extras", "The live price book has no extras.", "Extras did not load. Reload the page.", "Updating price", "Price changed", "The total changed. Check the new total, then save again.", "Flight number", "Enter the flight number", "Check the flight number", "Extras"]) {
      const line = dict.split("\n").find((l) => l.trim().startsWith(`'${key}':`));
      expect(line, key).toBeTruthy();
      for (const lang of ["de:", "fr:", "ar:"]) expect(line, `${key} ${lang}`).toContain(lang);
    }
  });
});
