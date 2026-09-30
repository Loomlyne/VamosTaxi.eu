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
import { checkIntentAgainstLock, type CheckIntentDeps } from "./intent";
import { mintLock, verifyLock, type QuoteLockPayload } from "./lock";
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

// Fake test secret, the same one every lock test uses — never a real key.
const SECRET = { current: "test-quote-lock-secret-current-not-real-00" };
const NOW = "2026-10-01T09:00:00.000Z";

// Two locks minted by the lock code as it stood BEFORE part D (branch base
// 5f9e3a07, mintLock and crypto/hmac unchanged since), with the fake secret.
// OLD_NO_STOP is the shape a customer's browser may still hold at the ship:
// an empty stop list on the leg and extras naming extra_stops: 0, waypoints: [].
// OLD_WITH_STOP carries a stop (extra_stops: 1 and one stop place).
const OLD_NO_STOP =
  "v1.eyJiYWdzIjoxLCJjbGFzc190b3RhbHMiOlt7InNsdWciOiJlY29ub215IiwidG90YWxfcmFwcGVuIjpudWxsfV0sImNvbXB1dGVkX2F0IjoiMjAyNi0xMC0wMVQwODowMDowMC4wMDBaIiwiY291cG9uIjpudWxsLCJkaXNwbGF5X2N1cnJlbmN5IjoiQ0hGIiwiZW5naW5lX3ZlcnNpb24iOiJxdW90ZS1lbmdpbmVAdGVzdCIsImV4cCI6IjIwOTktMDEtMDFUMTI6MDA6MDAuMDAwWiIsImV4dHJhcyI6eyJjaGlsZF9zZWF0cyI6MCwiZXh0cmFfc3RvcHMiOjAsIm92ZXJzaXplZF9sdWdnYWdlIjpmYWxzZSwid2F5cG9pbnRzIjpbXX0sImxlZ3MiOlt7ImRlc3Rfem9uZV9pZCI6bnVsbCwiZGlzdGFuY2VfbSI6MTIwMDAsImRyb3BvZmYiOnsibGF0Ijo0Ny40NTA0LCJsbmciOjguNTYyNCwidGV4dCI6IlpSSCJ9LCJkdXJhdGlvbl9zIjoxMjAwLCJmbGlnaHRfbm8iOm51bGwsImxhbmRpbmdfc291cmNlIjpudWxsLCJsZWdfc2VxIjoxLCJvcmlnaW5fem9uZV9pZCI6bnVsbCwicGlja3VwIjp7ImxhdCI6NDcuMzc2OSwibG5nIjo4LjU0MTcsInRleHQiOiJadXJpY2ggSEIifSwic2NoZWR1bGVkX2xvY2FsIjoiMjAyNi0xMC0wNFQxMDozMCIsIndheXBvaW50cyI6W119XSwibW9kZSI6Im9uZV93YXkiLCJwYXgiOjIsInF1b3RlX2lkIjoiMjIyMjIyMjItMjIyMi00MjIyLTgyMjItMjIyMjIyMjIyMjIyIiwicmF0ZV92ZXJzaW9uX2lkIjpudWxsLCJzZXR0aW5nc192ZXJzaW9uX2lkIjoxLCJ2IjoxfQ.fMH6z4LJX9X855XwQ2f1FVTwMEHOl-zY8SghijHfy_Y";
const OLD_WITH_STOP =
  "v1.eyJiYWdzIjoxLCJjbGFzc190b3RhbHMiOlt7InNsdWciOiJlY29ub215IiwidG90YWxfcmFwcGVuIjpudWxsfV0sImNvbXB1dGVkX2F0IjoiMjAyNi0xMC0wMVQwODowMDowMC4wMDBaIiwiY291cG9uIjpudWxsLCJkaXNwbGF5X2N1cnJlbmN5IjoiQ0hGIiwiZW5naW5lX3ZlcnNpb24iOiJxdW90ZS1lbmdpbmVAdGVzdCIsImV4cCI6IjIwOTktMDEtMDFUMTI6MDA6MDAuMDAwWiIsImV4dHJhcyI6eyJleHRyYV9zdG9wcyI6MSwid2F5cG9pbnRzIjpbeyJsYXQiOjQ3LjM4LCJsbmciOjguNTUsInRleHQiOiJTdG9wIn1dfSwibGVncyI6W3siZGVzdF96b25lX2lkIjpudWxsLCJkaXN0YW5jZV9tIjoxMjAwMCwiZHJvcG9mZiI6eyJsYXQiOjQ3LjQ1MDQsImxuZyI6OC41NjI0LCJ0ZXh0IjoiWlJIIn0sImR1cmF0aW9uX3MiOjEyMDAsImZsaWdodF9ubyI6bnVsbCwibGFuZGluZ19zb3VyY2UiOm51bGwsImxlZ19zZXEiOjEsIm9yaWdpbl96b25lX2lkIjpudWxsLCJwaWNrdXAiOnsibGF0Ijo0Ny4zNzY5LCJsbmciOjguNTQxNywidGV4dCI6Ilp1cmljaCBIQiJ9LCJzY2hlZHVsZWRfbG9jYWwiOiIyMDI2LTEwLTA0VDEwOjMwIiwid2F5cG9pbnRzIjpbeyJsYXQiOjQ3LjM4LCJsbmciOjguNTUsInRleHQiOiJTdG9wIn1dfV0sIm1vZGUiOiJvbmVfd2F5IiwicGF4IjoyLCJxdW90ZV9pZCI6IjIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMiIsInJhdGVfdmVyc2lvbl9pZCI6bnVsbCwic2V0dGluZ3NfdmVyc2lvbl9pZCI6MSwidiI6MX0.g-CG--adwiMxWZv63th8mQwVZTNBzKtdV_IvMo4ozzo";

function oldForm(overrides: { extras?: unknown; legWaypoints?: unknown; exp?: string } = {}): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "33333333-3333-4333-8333-333333333333",
    exp: overrides.exp ?? "2099-01-01T12:00:00.000Z",
    engine_version: "quote-engine@test",
    rate_version_id: null,
    settings_version_id: 1,
    computed_at: "2026-10-01T08:00:00.000Z",
    display_currency: "CHF",
    mode: "one_way",
    pax: 2,
    bags: 1,
    legs: [
      {
        leg_seq: 1,
        pickup: { lng: 8.5417, lat: 47.3769, text: "Zurich HB" },
        dropoff: { lng: 8.5624, lat: 47.4504, text: "ZRH" },
        scheduled_local: "2026-10-04T10:30",
        distance_m: 12000,
        duration_s: 1200,
        origin_zone_id: null,
        dest_zone_id: null,
        waypoints: overrides.legWaypoints ?? [],
        flight_no: null,
        landing_source: null,
      },
    ],
    extras: overrides.extras === undefined ? null : overrides.extras,
    coupon: null,
    class_totals: [{ slug: "economy", total_rappen: null }],
  } as unknown as QuoteLockPayload;
}

function intentDeps(): CheckIntentDeps {
  return {
    secrets: SECRET,
    workerNowIso: NOW,
    postgresNowIso: NOW,
    recompute: () => ({
      pricing_live: true,
      engine_version: "quote-engine@test",
      classes: [{ slug: "economy", total_rappen: null, eligible: true }],
    }),
  };
}

describe("26.2-p4 D3: the signed lock has no stop; old locks without a stop still work", () => {
  it("an old lock with the stop fields but no stop verifies, and the stop fields are gone from what the server reads", async () => {
    const result = await verifyLock(SECRET, OLD_NO_STOP, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.quote_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.payload.extras).toEqual({ child_seats: 0, oversized_luggage: false });
    expect(result.payload.legs[0]).not.toHaveProperty("waypoints");
    expect(result.payload.legs[0]?.distance_m).toBe(12000);
  });

  it("an old lock that carries a stop is refused", async () => {
    expect(await verifyLock(SECRET, OLD_WITH_STOP, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it.each([
    ["extras.extra_stops: 1", { extras: { extra_stops: 1 } }],
    ["extras.waypoints with a place", { extras: { waypoints: [STOP] } }],
    ["a leg's waypoints with a place", { legWaypoints: [STOP] }],
    ["a leg's waypoints that is not a list", { legWaypoints: "stop" }],
    ["extras.extra_stops that is not 0", { extras: { extra_stops: "0" } }],
  ])("a signed lock with %s is refused", async (_name, overrides) => {
    const token = await mintLock(SECRET, oldForm(overrides));
    expect(await verifyLock(SECRET, token, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("an old lock without a stop and only an empty leg list verifies (the usual shape: extras null)", async () => {
    const token = await mintLock(SECRET, oldForm());
    const result = await verifyLock(SECRET, token, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.extras).toBeNull();
      expect(result.payload.legs[0]).not.toHaveProperty("waypoints");
    }
  });

  it("an expired old lock that carries a stop is invalid, not expired", async () => {
    const token = await mintLock(SECRET, oldForm({ exp: "2026-01-01T00:00:00.000Z", extras: { extra_stops: 1 } }));
    expect(await verifyLock(SECRET, token, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("an expired old lock without a stop is expired, and its payload has no stop fields", async () => {
    const token = await mintLock(
      SECRET,
      oldForm({ exp: "2026-01-01T00:00:00.000Z", extras: { extra_stops: 0, waypoints: [] } }),
    );
    const result = await verifyLock(SECRET, token, NOW);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "expired") throw new Error("expected expired");
    expect(result.payload.extras).toEqual({});
    expect(result.payload.legs[0]).not.toHaveProperty("waypoints");
  });

  it("the checkout intent takes the old lock without a stop and refuses the one with a stop", async () => {
    const base = { vehicle_class: "economy", idempotency_key: "idem-d3" } as const;
    const kept = await checkIntentAgainstLock(
      { ...base, quote_id: "22222222-2222-4222-8222-222222222222", lock: OLD_NO_STOP },
      intentDeps(),
    );
    expect(kept).not.toEqual({ ok: false, code: "quote_not_found" });
    const refused = await checkIntentAgainstLock(
      { ...base, quote_id: "22222222-2222-4222-8222-222222222222", lock: OLD_WITH_STOP },
      intentDeps(),
    );
    expect(refused).toEqual({ ok: false, code: "quote_not_found" });
  });

  it("the lock type and its writers name no stop count; the mint writes no stop list", () => {
    const lock = code("lib", "quote", "lock.ts");
    const extrasType = lock.slice(lock.indexOf("export interface QuoteLockExtras"), lock.indexOf("export interface QuoteLockPayload"));
    expect(extrasType).not.toMatch(/extra_stops|waypoints/);
    expect(code("lib", "quote", "pipeline.ts")).not.toMatch(/waypoints/);
  });
});
