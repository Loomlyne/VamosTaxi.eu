// apps/web/lib/ops/booking-change-trip-map.test.ts
//
// 26.2 P6: the body of a trip change (places from the address search, date and time, passengers,
// bags, the signed trip facts, the driver choice) and the refusals it can answer. Pure.

import { describe, expect, it } from "vitest";
import { changeFailStatus, mapChangeSqlError, parseChangeRequest, tripTarget } from "./booking-change-map";

const zug = { kind: "retrieve", mapbox_id: "mb-zug", session_token: "tok-1", text: "Zug station, Bahnhofplatz, 6300 Zug" };

describe("parseChangeRequest: P1's class body stays as it was", () => {
  it("a class-only body has no trip part", () => {
    expect(parseChangeRequest({ klass: "business", expectTotalRappen: 13, expectPaidRappen: 10 })).toEqual({
      ok: true,
      value: { klass: "business", expectTotalRappen: 13, expectPaidRappen: 10, trip: null },
    });
    expect(parseChangeRequest({})).toEqual({
      ok: true,
      value: { klass: null, expectTotalRappen: null, expectPaidRappen: null, trip: null },
    });
  });
});

describe("parseChangeRequest: the trip part (only what changed)", () => {
  it("a place picked from the address search, as the quote reads it", () => {
    const parsed = parseChangeRequest({ pickup: zug });
    expect(parsed).toMatchObject({ ok: true, value: { trip: { pickup: zug, dropoff: null, scheduledLocal: null, pax: null, bags: null, lock: null, driver: null } } });
  });

  it("date and time travel together as one Zurich wall clock", () => {
    expect(parseChangeRequest({ dateIso: "2026-10-08", time: "10:00" })).toMatchObject({
      ok: true,
      value: { trip: { scheduledLocal: "2026-10-08T10:00" } },
    });
    expect(parseChangeRequest({ dateIso: "2026-10-08" })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ dateIso: "08.10.2026", time: "10:00" })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ dateIso: "2026-10-08", time: "24:00" })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ dateIso: "2026-02-31", time: "10:00" })).toEqual({ ok: false, code: "invalid-body" });
  });

  it("passengers 1-16 and bags 0-16 (the database's own limits)", () => {
    expect(parseChangeRequest({ pax: 6, bags: 0 })).toMatchObject({ ok: true, value: { trip: { pax: 6, bags: 0 } } });
    expect(parseChangeRequest({ pax: 0 })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ pax: 17 })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ bags: 2.5 })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ pax: "3" })).toEqual({ ok: false, code: "invalid-body" });
  });

  it("the signed trip facts and the driver choice travel with the confirm", () => {
    expect(
      parseChangeRequest({ pickup: zug, lock: "v1.abc.def", driver: "unassign", klass: "business", expectTotalRappen: 15, expectPaidRappen: 10 }),
    ).toEqual({
      ok: true,
      value: {
        klass: "business",
        expectTotalRappen: 15,
        expectPaidRappen: 10,
        trip: { pickup: zug, dropoff: null, scheduledLocal: null, pax: null, bags: null, lock: "v1.abc.def", driver: "unassign" },
      },
    });
    expect(parseChangeRequest({ pickup: zug, driver: "maybe" })).toEqual({ ok: false, code: "invalid-body" });
  });

  it("typed text, coordinates or an amount from the browser are refused", () => {
    expect(parseChangeRequest({ pickup: "Zug" })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ pickup: { kind: "coords", lng: 8.5, lat: 47.1, text: "Zug" } })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ pickup: { ...zug, lat: 47.1 } })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ pickup: zug, distance_m: 1 })).toEqual({ ok: false, code: "invalid-body" });
    expect(parseChangeRequest({ pickup: zug, totalRappen: 1 })).toEqual({ ok: false, code: "invalid-body" });
  });
});

describe("tripTarget: the trip as edited against the trip as booked", () => {
  const leg = { scheduledLocal: "2026-10-08T08:00", pax: 3, bags: 2 };
  const NOW = Date.parse("2026-10-01T08:00:00Z");
  const trip = { pickup: null, dropoff: null, scheduledLocal: null, pax: null, bags: null, lock: null, driver: null };

  it("a time that has passed is refused under the time field", () => {
    expect(tripTarget(leg, { ...trip, scheduledLocal: "2026-09-30T10:00" }, NOW)).toEqual({ ok: false, code: "past-time", field: "when" });
  });

  it("only what really changed counts", () => {
    expect(tripTarget(leg, { ...trip, scheduledLocal: "2026-10-08T08:00", pax: 3 }, NOW)).toEqual({
      ok: true, scheduledLocal: "2026-10-08T08:00", pax: 3, bags: 2,
      placesChanged: false, timeChanged: false, partyChanged: false,
    });
    expect(tripTarget(leg, { ...trip, scheduledLocal: "2026-10-08T10:00", bags: 4, pickup: { kind: "retrieve", mapbox_id: "m", session_token: "t", text: "Zug" } }, NOW))
      .toMatchObject({ ok: true, scheduledLocal: "2026-10-08T10:00", bags: 4, placesChanged: true, timeChanged: true, partyChanged: true });
  });
});

describe("P6 refusals", () => {
  it("each RAISE of booking_staff_trip_change maps to its code", () => {
    for (const name of ["past-time", "no-change", "invalid-change", "driver-choice-needed", "driver-overlap"]) {
      expect(mapChangeSqlError(Object.assign(new Error(name), { code: "P0001" }))).toEqual({ ok: false, code: name });
    }
  });
  it("a refusal of the change answers 409; a place refusal names its field in the body", () => {
    expect(changeFailStatus("place-not-served")).toBe(409);
    expect(changeFailStatus("driver-overlap")).toBe(409);
    expect(changeFailStatus("lock-invalid")).toBe(409);
    expect(changeFailStatus("temporarily-unavailable")).toBe(503);
  });
});
