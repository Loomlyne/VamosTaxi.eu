// apps/web/lib/quote/no-extra-stop.test.ts
//
// 26.2-p4 part D: there is no stop on the way in this product (owner, 2026-09-30:
// "there is no extra stop, remove anything related to it"). Each block proves one
// removal. Source files are read as text with comments removed, so a word in a
// comment that explains history does not count as code.
//
// What stays on purpose: the database column rate_versions.max_extra_stops (no
// longer read; its drop is a later migration on the owner's word) and the
// readers that print an `extra_stop` line on an OLD booking's receipt or mail.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkoutPayLinkSchema } from "../checkout/intent-schema";
import { buildExtraLines, buildFixedRouteExtraLine } from "../pricing/lines";
import { parseQuoteRequest, parseRepriceRequest } from "./schema";
import type {
  FixedRouteRow,
  QuoteLegInput,
  SurchargeRow,
  VehicleClassRow,
  ZoneRow,
} from "../pricing/types";

const WEB = join(__dirname, "..", "..");

function code(...path: string[]): string {
  return readFileSync(join(WEB, ...path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/[^\n]*$/, "$1"))
    .join("\n");
}

const business: VehicleClassRow = {
  id: "vc-business",
  slug: "business",
  passenger_capacity: 3,
  luggage_capacity: 3,
  sort_order: 0,
  active: true,
};

const zones: ZoneRow[] = [
  { id: "z-zh", slug: "canton-zh", iata: null, active: true, zone_type: "other", tags: ["canton:ZH"] },
  { id: "z-vs", slug: "canton-vs", iata: null, active: true, zone_type: "other", tags: ["canton:VS"] },
];

const cantonPair: FixedRouteRow = {
  id: 2,
  rate_version_id: 1,
  origin_zone_id: "z-zh",
  dest_zone_id: "z-vs",
  vehicle_class_id: business.id,
  price_rappen: 9000,
  live: true,
  kind: "canton",
};

function leg(seq: 1 | 2 = 1): QuoteLegInput {
  return {
    leg_seq: seq,
    scheduled_local: "2026-10-04T10:30",
    distance_m: 1000,
    duration_s: 600,
    origin_zone_id: "z-a",
    dest_zone_id: "z-b",
    origin_canton: "ZH",
    dest_canton: "VS",
  };
}

function row(partial: Partial<SurchargeRow> & Pick<SurchargeRow, "code">): SurchargeRow {
  return {
    id: 15,
    rate_version_id: 1,
    kind: "amount",
    amount_rappen: 150,
    percent: null,
    applies_to: "leg",
    active: true,
    predicate: { kind: "quantity" },
    quantity_source: null,
    ...partial,
  };
}

describe("26.2-p4 D1: the fare engine has no stop branch", () => {
  it("control: a plain leg gets its canton pair extra", () => {
    const extra = buildFixedRouteExtraLine({
      leg: leg(),
      vehicleClass: business,
      fixedRoutes: [cantonPair],
      rateVersionId: 1,
      zones,
    });
    expect(extra?.amount_rappen).toBe(9000);
  });

  it("a leg that still carries a stop list keeps its city/canton pair extra", () => {
    const withStop = { ...leg(), waypoints: [{ lng: 8.55, lat: 47.38 }] } as QuoteLegInput;
    const extra = buildFixedRouteExtraLine({
      leg: withStop,
      vehicleClass: business,
      fixedRoutes: [cantonPair],
      rateVersionId: 1,
      zones,
    });
    expect(extra?.basis.matched).toBe("canton");
    expect(extra?.amount_rappen).toBe(9000);
  });

  it("a stop flag sent to the pair builder changes nothing", () => {
    const args = {
      leg: leg(),
      vehicleClass: business,
      fixedRoutes: [cantonPair],
      rateVersionId: 1,
      zones,
      hasExtraStops: true,
    } as Parameters<typeof buildFixedRouteExtraLine>[0];
    expect(buildFixedRouteExtraLine(args)?.amount_rappen).toBe(9000);
  });

  it("a row coded extra_stop is an ordinary row: its own quantity source decides, never the name", () => {
    const lines = buildExtraLines({
      legs: [leg(1), leg(2)],
      surcharges: [row({ code: "extra_stop", quantity_source: "child_seats" })],
      extras: { child_seats: 1 },
      rateVersionId: 1,
    });
    expect(lines.map((line) => line.leg_seq)).toEqual([1, 2]);
    expect(lines.every((line) => line.amount_rappen === 150)).toBe(true);
  });

  it("the quantity source extra_stops counts nothing, whatever the request says", () => {
    const lines = buildExtraLines({
      legs: [leg(1)],
      surcharges: [row({ code: "stop", quantity_source: "extra_stops" })],
      extras: { extra_stops: 1 },
      rateVersionId: 1,
    });
    expect(lines).toEqual([]);
  });

  it("no stop word is left in the engine code", () => {
    for (const file of [
      ["lib", "pricing", "lines.ts"],
      ["lib", "pricing", "priceQuote.ts"],
      ["lib", "pricing", "types.ts"],
      ["lib", "ops", "draft-preview.ts"],
    ]) {
      const text = code(...file);
      expect(text, file.join("/")).not.toMatch(/extra_stops?\b|hasExtraStops|ExtraStops|waypoints/);
    }
  });
});

const STOP = { lng: 8.55, lat: 47.38, text: "Stop" };

function quoteBody(extras: Record<string, unknown>): Record<string, unknown> {
  return {
    locale: "en",
    display_currency: "CHF",
    mode: "one_way",
    pickup: { kind: "pin", lng: 8.5417, lat: 47.3769, text: "Zurich HB" },
    dropoff: { kind: "pin", lng: 8.5624, lat: 47.4504, text: "ZRH" },
    legs: [{ leg_seq: 1, scheduled_local: "2026-10-04T10:30" }],
    pax: 2,
    bags: 1,
    extras,
  };
}

function repriceBody(extras: Record<string, unknown>): Record<string, unknown> {
  return { quote_id: "q", lock: "v1.x.y", locale: "en", display_currency: "CHF", extras };
}

describe("26.2-p4 D2: a quote or reprice request carries no stop", () => {
  it.each([
    [{ extra_stops: 0 }, "extra_stops"],
    [{ extra_stops: 1 }, "extra_stops"],
    [{ waypoints: [] }, "waypoints"],
    [{ waypoints: [STOP] }, "waypoints"],
    [{ extra_stops: 1, waypoints: [STOP] }, "extra_stops"],
  ])("quote refuses %j", (extras, field) => {
    expect(parseQuoteRequest(quoteBody(extras))).toEqual({
      ok: false,
      code: "extras_max_stops",
      field,
    });
  });

  it.each([
    [{ extra_stops: 0 }, "extra_stops"],
    [{ waypoints: [STOP] }, "waypoints"],
  ])("reprice refuses %j", (extras, field) => {
    expect(parseRepriceRequest(repriceBody(extras))).toEqual({
      ok: false,
      code: "extras_max_stops",
      field,
    });
  });

  it("the other extras still parse", () => {
    expect(parseQuoteRequest(quoteBody({ child_seats: 1, oversized_luggage: true })).ok).toBe(true);
    expect(parseRepriceRequest(repriceBody({ child_seats: 0 })).ok).toBe(true);
  });

  it("the pay-link body's three-code extras object has no stop", () => {
    const body = {
      quote_id: "00000000-0000-4000-8000-000000000001",
      lock: "v1.payload.mac",
      vehicle_class: "economy",
      contact: { name: "Ada", email: "ada@example.test", phone: "+41790000000" },
      locale: "en",
      display_currency: "CHF",
      idempotency_key: "idem-1",
      billing_kind: "individual",
      payer_email: "ada@example.test",
    };
    expect(checkoutPayLinkSchema.safeParse({ ...body, extras: { child_seats: 1 } }).success).toBe(true);
    expect(checkoutPayLinkSchema.safeParse({ ...body, extras: { extra_stops: 0 } }).success).toBe(false);
    expect(checkoutPayLinkSchema.safeParse({ ...body, extras: { waypoints: [] } }).success).toBe(false);
  });

  it("the request code has no stop fields and the reprice spends no Directions call", () => {
    const schema = code("lib", "quote", "schema.ts");
    expect(schema).not.toMatch(/WaypointSchema|extras\.extra_stops|extras\.waypoints/);
    expect(code("lib", "checkout", "intent-schema.ts")).not.toMatch(/extra_stops|waypoints/);
    const pipeline = code("lib", "quote", "pipeline.ts");
    expect(pipeline).not.toMatch(/extra_stops|waypointsChanged|extraStopsWaypointMismatch/);
    const reprice = pipeline.slice(
      pipeline.indexOf("export async function runRepricePipeline"),
      pipeline.indexOf("export async function defaultQuoteLockDeadline"),
    );
    expect(reprice.length).toBeGreaterThan(100);
    expect(reprice).not.toMatch(/countMapboxUnit|routeLegs|quoteLockDeadline|mintQuoteId/);
    expect(code("lib", "geo", "mapbox.ts")).not.toMatch(/waypoints/);
  });
});
