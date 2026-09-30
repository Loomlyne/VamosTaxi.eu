// apps/web/lib/pricing/predicates.test.ts
//
// Surcharge predicate proofs (D-09, D-10, D-39). No Date, no iata inference.
// Night window values live on the fixture predicate, never as engine constants.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  evaluatePredicate,
  isWithinLocalWindow,
} from "./predicates";
import type { SurchargePredicate, ZoneRow } from "./types";

function zone(partial: Partial<ZoneRow> & Pick<ZoneRow, "id" | "slug">): ZoneRow {
  return {
    id: partial.id,
    slug: partial.slug,
    iata: partial.iata ?? null,
    active: partial.active ?? true,
    zone_type: partial.zone_type ?? "other",
    tags: partial.tags ?? [],
  };
}

const zrh = zone({
  id: "z-zrh",
  slug: "zrh-airport",
  zone_type: "airport",
  iata: "ZRH",
});
const ski = zone({
  id: "z-ski",
  slug: "verbier",
  zone_type: "ski",
  tags: ["ski", "alpine"],
});
const city = zone({
  id: "z-city",
  slug: "zurich-city",
  zone_type: "city",
});

function zonesMap(...rows: ZoneRow[]): Map<string, ZoneRow> {
  return new Map(rows.map((z) => [z.id, z]));
}

describe("isWithinLocalWindow", () => {
  it("wrapping window 20:00–06:00 includes 23:10 and 05:59", () => {
    expect(isWithinLocalWindow("2026-09-04T23:10", "20:00", "06:00")).toBe(true);
    expect(isWithinLocalWindow("2026-09-04T05:59", "20:00", "06:00")).toBe(true);
  });

  it("wrapping window 20:00–06:00 excludes 06:00 and 19:59", () => {
    expect(isWithinLocalWindow("2026-09-04T06:00", "20:00", "06:00")).toBe(false);
    expect(isWithinLocalWindow("2026-09-04T19:59", "20:00", "06:00")).toBe(false);
  });

  it("non-wrapping window 09:00–17:00 is half-open [from, to)", () => {
    expect(isWithinLocalWindow("2026-09-04T09:00", "09:00", "17:00")).toBe(true);
    expect(isWithinLocalWindow("2026-09-04T12:30", "09:00", "17:00")).toBe(true);
    expect(isWithinLocalWindow("2026-09-04T17:00", "09:00", "17:00")).toBe(false);
    expect(isWithinLocalWindow("2026-09-04T08:59", "09:00", "17:00")).toBe(false);
  });

  it("property: wrapping window and its complement partition all 1440 minutes once", () => {
    const from = "20:00";
    const to = "06:00";
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1439 }), (minuteOfDay) => {
        const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
        const mm = String(minuteOfDay % 60).padStart(2, "0");
        const scheduled = `2026-09-04T${hh}:${mm}`;
        const inWindow = isWithinLocalWindow(scheduled, from, to);
        const inComplement = isWithinLocalWindow(scheduled, to, from);
        // For a wrap (from > to), complement is the non-wrap (to, from) when to < from...
        // Actually complement of (t >= from || t < to) when from > to is (t >= to && t < from).
        const expectedComplement =
          `${hh}:${mm}` >= to && `${hh}:${mm}` < from;
        expect(inComplement).toBe(expectedComplement);
        expect(inWindow || expectedComplement).toBe(true);
        expect(inWindow && expectedComplement).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

describe("evaluatePredicate", () => {
  it("always applies unconditionally with why.predicate always", () => {
    const result = evaluatePredicate(
      { kind: "always" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: zrh.id,
        destZoneId: city.id,
        zones: zonesMap(zrh, city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(true);
    expect(result.why).toEqual({ predicate: "always" });
    expect(result.quantity).toBe(0);
  });

  it("pickup_zone_type airport applies when origin zone_type matches", () => {
    const result = evaluatePredicate(
      { kind: "pickup_zone_type", zone_type: "airport" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: zrh.id,
        destZoneId: city.id,
        zones: zonesMap(zrh, city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(true);
    expect(result.why.zone_slug).toBe("zrh-airport");
    expect(result.why.zone_type).toBe("airport");
  });

  it("pickup_zone_type airport does not apply for city origin", () => {
    const result = evaluatePredicate(
      { kind: "pickup_zone_type", zone_type: "airport" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: city.id,
        destZoneId: zrh.id,
        zones: zonesMap(zrh, city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(false);
  });

  it("dest_zone_tag ski applies when dest tags contain the tag", () => {
    const result = evaluatePredicate(
      { kind: "dest_zone_tag", tag: "ski" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: zrh.id,
        destZoneId: ski.id,
        zones: zonesMap(zrh, ski),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(true);
    expect(result.why.tag).toBe("ski");
    expect(result.why.zone_slug).toBe("verbier");
  });

  it("dest_zone_tag ski does not apply when tag missing", () => {
    const result = evaluatePredicate(
      { kind: "dest_zone_tag", tag: "ski" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: zrh.id,
        destZoneId: city.id,
        zones: zonesMap(zrh, city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(false);
  });

  it("local_time_window wrapping applies at 23:10 and 05:59, not 06:00 or 19:59", () => {
    const pred: SurchargePredicate = {
      kind: "local_time_window",
      tz: "Europe/Zurich",
      from: "20:00",
      to: "06:00",
    };
    const base = {
      originZoneId: city.id,
      destZoneId: city.id,
      zones: zonesMap(city),
      quantity: 0,
    };
    expect(
      evaluatePredicate(pred, { ...base, scheduledLocal: "2026-09-04T23:10" }).applies,
    ).toBe(true);
    expect(
      evaluatePredicate(pred, { ...base, scheduledLocal: "2026-09-04T05:59" }).applies,
    ).toBe(true);
    expect(
      evaluatePredicate(pred, { ...base, scheduledLocal: "2026-09-04T06:00" }).applies,
    ).toBe(false);
    expect(
      evaluatePredicate(pred, { ...base, scheduledLocal: "2026-09-04T19:59" }).applies,
    ).toBe(false);
  });

  it("local_time_window carries tz and wall-clock into why without converting", () => {
    const result = evaluatePredicate(
      {
        kind: "local_time_window",
        tz: "Europe/Zurich",
        from: "20:00",
        to: "06:00",
      },
      {
        scheduledLocal: "2026-09-04T23:10",
        originZoneId: city.id,
        destZoneId: city.id,
        zones: zonesMap(city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(true);
    expect(result.why.tz).toBe("Europe/Zurich");
    expect(result.why.from).toBe("20:00");
    expect(result.why.to).toBe("06:00");
    expect(result.why.scheduled_local).toBe("2026-09-04T23:10");
  });

  it("quantity applies when quantity > 0 and reports that quantity", () => {
    const result = evaluatePredicate(
      { kind: "quantity" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: city.id,
        destZoneId: city.id,
        zones: zonesMap(city),
        quantity: 2,
      },
    );
    expect(result.applies).toBe(true);
    expect(result.quantity).toBe(2);
    expect(result.why.quantity).toBe(2);
  });

  it("quantity does not apply when quantity is zero", () => {
    const result = evaluatePredicate(
      { kind: "quantity" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: city.id,
        destZoneId: city.id,
        zones: zonesMap(city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(false);
    expect(result.quantity).toBe(0);
  });

  it("empty predicate returns not-applicable with unresolved reason", () => {
    const result = evaluatePredicate(
      {} as SurchargePredicate,
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: city.id,
        destZoneId: city.id,
        zones: zonesMap(city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(false);
    expect(result.unresolved).toBeTruthy();
  });

  it("unknown kind returns not-applicable with unresolved reason", () => {
    const result = evaluatePredicate(
      { kind: "seasonal_moon_phase" } as unknown as SurchargePredicate,
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: city.id,
        destZoneId: city.id,
        zones: zonesMap(city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(false);
    expect(result.unresolved).toBeTruthy();
  });

  it("manual (chosen by the customer at checkout) never applies in the quote, and says why", () => {
    const contexts = [
      { originZoneId: zrh.id, destZoneId: ski.id, quantity: 0 },
      { originZoneId: city.id, destZoneId: city.id, quantity: 3 },
      { originZoneId: null, destZoneId: null, quantity: 0 },
    ];
    for (const ctx of contexts) {
      const result = evaluatePredicate(
        { kind: "manual" },
        { scheduledLocal: "2026-09-04T23:10", zones: zonesMap(zrh, ski, city), ...ctx },
      );
      expect(result.applies).toBe(false);
      expect(result.quantity).toBe(0);
      expect(result.why).toEqual({ predicate: "manual" });
      // A known rule, not an unreadable one.
      expect(result.unresolved).toBeUndefined();
    }
  });

  it("unresolved origin zone id returns applies false with unresolved set", () => {
    const result = evaluatePredicate(
      { kind: "pickup_zone_type", zone_type: "airport" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: "missing-zone",
        destZoneId: city.id,
        zones: zonesMap(city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(false);
    expect(result.unresolved).toBeTruthy();
  });

  it("unresolved dest zone id returns applies false with unresolved set", () => {
    const result = evaluatePredicate(
      { kind: "dest_zone_tag", tag: "ski" },
      {
        scheduledLocal: "2026-09-04T12:00",
        originZoneId: city.id,
        destZoneId: "missing-dest",
        zones: zonesMap(city),
        quantity: 0,
      },
    );
    expect(result.applies).toBe(false);
    expect(result.unresolved).toBeTruthy();
  });

  it("is pure: same args yield identical results regardless of wall clock", () => {
    const pred: SurchargePredicate = {
      kind: "local_time_window",
      tz: "Europe/Zurich",
      from: "20:00",
      to: "06:00",
    };
    const ctx = {
      scheduledLocal: "2026-09-04T23:10",
      originZoneId: city.id,
      destZoneId: city.id,
      zones: zonesMap(city),
      quantity: 0,
    };
    const a = evaluatePredicate(pred, ctx);
    const b = evaluatePredicate(pred, ctx);
    expect(a).toEqual(b);
  });
});
