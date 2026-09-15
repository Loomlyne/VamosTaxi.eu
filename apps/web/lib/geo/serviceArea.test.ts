// apps/web/lib/geo/serviceArea.test.ts
//
// Pure proofs for QUOTE-07's two paths, opposite NULLs, ray-casting, and
// the pre-Mapbox refusals. No I/O, no clock, no Mapbox.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  SAME_COORDINATE_METRES,
  checkMinAdvance,
  checkServiceArea,
  insideCountryBox,
  insideEurope,
  pointInPolygon,
  publishedServiceAreaPolygon,
  sameCoordinate,
  type LinearRing,
  type PolygonGeometry,
  type ServiceAreaGeoJSON,
} from "./serviceArea";

const ZURICH_HB = { lng: 8.5417, lat: 47.3769 };
const ZERMATT = { lng: 7.7491, lat: 46.0207 };
const CHAMONIX = { lng: 6.8694, lat: 45.9237 };
const MALPENSA = { lng: 8.7231, lat: 45.6306 };
const LONDON = { lng: -0.1278, lat: 51.5074 };
const PARIS = { lng: 2.3522, lat: 48.8566 };
const TUNIS = { lng: 10.1815, lat: 36.8065 };
const NYC = { lng: -74.006, lat: 40.7128 };
const BEIJING = { lng: 116.4074, lat: 39.9042 };
const NULL_ISLAND = { lng: 0, lat: 0 };

const SQUARE: PolygonGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
  ],
};

const SQUARE_WITH_HOLE: PolygonGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ],
  ],
};

const MULTI: ServiceAreaGeoJSON = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
    [
      [
        [8, 8],
        [12, 8],
        [12, 12],
        [8, 12],
        [8, 8],
      ],
    ],
  ],
};

function isLeft(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): number {
  return (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
}

/** Winding-number reference (non-zero = inside). Written here so the property
 *  does not compare the implementation to itself. */
function windingInside(lng: number, lat: number, ring: LinearRing): boolean {
  const pts =
    ring.length > 0 &&
    ring[0] &&
    ring[ring.length - 1] &&
    ring[0][0] === ring[ring.length - 1]![0] &&
    ring[0][1] === ring[ring.length - 1]![1]
      ? ring
      : [...ring, ring[0]!];
  let wn = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const [x1, y1] = a;
    const [x2, y2] = b;
    if (y1 <= lat) {
      if (y2 > lat && isLeft(x1, y1, x2, y2, lng, lat) > 0) wn += 1;
    } else if (y2 <= lat && isLeft(x1, y1, x2, y2, lng, lat) < 0) {
      wn -= 1;
    }
  }
  return wn !== 0;
}

describe("sameCoordinate", () => {
  it("is true at ~9 m and false at ~11 m against the named threshold", () => {
    expect(SAME_COORDINATE_METRES).toBe(10);
    const R = 6_371_008.8;
    const dLat9 = (9 / R) * (180 / Math.PI);
    const dLat11 = (11 / R) * (180 / Math.PI);
    expect(sameCoordinate(ZURICH_HB, { lng: ZURICH_HB.lng, lat: ZURICH_HB.lat + dLat9 })).toBe(
      true,
    );
    expect(
      sameCoordinate(ZURICH_HB, { lng: ZURICH_HB.lng, lat: ZURICH_HB.lat + dLat11 }),
    ).toBe(false);
  });
});

describe("insideEurope", () => {
  it("includes London, Paris, Zermatt, Chamonix and Malpensa", () => {
    expect(insideEurope(LONDON)).toBe(true);
    expect(insideEurope(PARIS)).toBe(true);
    expect(insideEurope(ZERMATT)).toBe(true);
    expect(insideEurope(CHAMONIX)).toBe(true);
    expect(insideEurope(MALPENSA)).toBe(true);
  });

  it("excludes New York and Beijing", () => {
    expect(insideEurope(NYC)).toBe(false);
    expect(insideEurope(BEIJING)).toBe(false);
    expect(insideEurope(NULL_ISLAND)).toBe(false);
  });
});

describe("insideCountryBox", () => {
  it("accepts Zurich HB, Zermatt, Chamonix and Milano Malpensa", () => {
    expect(insideCountryBox(ZURICH_HB)).toBe(true);
    expect(insideCountryBox(ZERMATT)).toBe(true);
    expect(insideCountryBox(CHAMONIX)).toBe(true);
    expect(insideCountryBox(MALPENSA)).toBe(true);
  });

  it("rejects London, Tunis and null-island", () => {
    expect(insideCountryBox(LONDON)).toBe(false);
    expect(insideCountryBox(TUNIS)).toBe(false);
    expect(insideCountryBox(NULL_ISLAND)).toBe(false);
  });
});

describe("pointInPolygon", () => {
  it("returns true inside a simple square and false outside", () => {
    expect(pointInPolygon({ lng: 2, lat: 2 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ lng: 5, lat: 2 }, SQUARE)).toBe(false);
  });

  it("returns false for a point inside a hole", () => {
    expect(pointInPolygon({ lng: 5, lat: 5 }, SQUARE_WITH_HOLE)).toBe(false);
    expect(pointInPolygon({ lng: 1, lat: 1 }, SQUARE_WITH_HOLE)).toBe(true);
  });

  it("returns true for a point inside the second member of a MultiPolygon", () => {
    expect(pointInPolygon({ lng: 10, lat: 10 }, MULTI)).toBe(true);
    expect(pointInPolygon({ lng: 5, lat: 5 }, MULTI)).toBe(false);
  });

  it("returns true for a point exactly on an edge and exactly on a vertex", () => {
    expect(pointInPolygon({ lng: 2, lat: 0 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ lng: 0, lat: 0 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ lng: 2, lat: 0 }, SQUARE)).toBe(true);
  });

  it("handles a polygon whose ring is not explicitly closed", () => {
    const unclosed: ServiceAreaGeoJSON = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
        ],
      ],
    };
    expect(pointInPolygon({ lng: 2, lat: 2 }, unclosed)).toBe(true);
    expect(pointInPolygon({ lng: 2, lat: 0 }, unclosed)).toBe(true);
  });

  it("property: agrees with winding-number on points inside a random convex ring's bbox", () => {
    const cell = fc.integer({ min: 0, max: 20 });
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(cell, cell), { minLength: 3, maxLength: 8 }),
        cell,
        cell,
        (pts, lng, lat) => {
          const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
          const ring: LinearRing = [...pts]
            .sort(
              (a, b) =>
                Math.atan2(a[1] - cy, a[0] - cx) -
                Math.atan2(b[1] - cy, b[0] - cx),
            )
            .map(([x, y]) => [x, y] as [number, number]);
          if (ring.length < 3) return;
          let area = 0;
          for (let i = 0; i < ring.length; i += 1) {
            const [x1, y1] = ring[i]!;
            const [x2, y2] = ring[(i + 1) % ring.length]!;
            area += x1 * y2 - x2 * y1;
          }
          if (Math.abs(area) < 1e-9) return;
          const onVertex = ring.some(([x, y]) => x === lng && y === lat);
          if (onVertex) return;
          const onEdge = ring.some((_, i) => {
            const [ax, ay] = ring[i]!;
            const [bx, by] = ring[(i + 1) % ring.length]!;
            const cross = (lng - ax) * (by - ay) - (lat - ay) * (bx - ax);
            if (cross !== 0) return false;
            const dot = (lng - ax) * (bx - ax) + (lat - ay) * (by - ay);
            const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
            return dot >= 0 && dot <= len2;
          });
          if (onEdge) return;
          const geometry: PolygonGeometry = { type: "Polygon", coordinates: [ring] };
          const ours = pointInPolygon({ lng, lat }, geometry);
          const ref = windingInside(lng, lat, ring);
          expect(ours).toBe(ref);
        },
      ),
      { numRuns: 80 },
    );
  });
});

describe("checkServiceArea", () => {
  const pair = {
    origin_zone_id: "zrh",
    dest_zone_id: "zermatt",
    live: true,
  };

  it("matches a live named pair forward even when the polygon is null", () => {
    const result = checkServiceArea({
      origin: { ...ZURICH_HB, zoneId: "zrh" },
      dest: { ...ZERMATT, zoneId: "zermatt" },
      polygon: null,
      fixedRoutes: [pair],
    });
    expect(result).toEqual({ ok: true, matched: "forward" });
  });

  it("matches the reversed pair without consulting the polygon", () => {
    const result = checkServiceArea({
      origin: { ...ZERMATT, zoneId: "zermatt" },
      dest: { ...ZURICH_HB, zoneId: "zrh" },
      polygon: null,
      fixedRoutes: [pair],
    });
    expect(result).toEqual({ ok: true, matched: "reverse" });
  });

  it("quotes Zurich–Zermatt in Europe when the polygon is null and no pair matches", () => {
    const result = checkServiceArea({
      origin: ZURICH_HB,
      dest: ZERMATT,
      polygon: null,
      fixedRoutes: [],
    });
    expect(result).toEqual({ ok: true });
  });

  it("quotes London–Paris even when they sit outside the CH polygon", () => {
    const result = checkServiceArea({
      origin: LONDON,
      dest: PARIS,
      polygon: SQUARE,
      fixedRoutes: [],
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses when one pin is in Europe and the other is not", () => {
    const originIn = checkServiceArea({
      origin: ZURICH_HB,
      dest: NYC,
      polygon: null,
      fixedRoutes: [],
    });
    expect(originIn).toEqual({ ok: false, code: "out_of_service_area" });
    const destIn = checkServiceArea({
      origin: NYC,
      dest: ZURICH_HB,
      polygon: null,
      fixedRoutes: [],
    });
    expect(destIn).toEqual({ ok: false, code: "out_of_service_area" });
  });

  it("refuses New York–Beijing", () => {
    const result = checkServiceArea({
      origin: NYC,
      dest: BEIJING,
      polygon: null,
      fixedRoutes: [],
    });
    expect(result).toEqual({ ok: false, code: "out_of_service_area" });
  });

  it("still publishes the snapshot polygon helper for ops", () => {
    expect(publishedServiceAreaPolygon(SQUARE)).toEqual(SQUARE);
    expect(publishedServiceAreaPolygon(null)).toBeNull();
    expect(publishedServiceAreaPolygon({ type: "Point" })).toBeNull();
  });
});

describe("checkMinAdvance", () => {
  it("skips the threshold when minAdvanceMinutes is null, even one minute from now", () => {
    const nowMs = Date.UTC(2026, 5, 1, 10, 0, 0);
    const result = checkMinAdvance({
      scheduledLocal: "2026-06-01T12:01",
      minAdvanceMinutes: null,
      nowMs: nowMs,
    });
    expect(result).toEqual({ ok: true });
  });

  it("refuses two hours out against a 180-minute argument and accepts four hours out", () => {
    const nowMs = Date.UTC(2026, 5, 1, 8, 0, 0);
    const twoHours = checkMinAdvance({
      scheduledLocal: "2026-06-01T12:00",
      minAdvanceMinutes: 180,
      nowMs,
    });
    expect(twoHours).toEqual({
      ok: false,
      code: "min_advance",
      params: { minutes: 180 },
    });
    if (!twoHours.ok) {
      expect(twoHours.params.minutes).toBe(180);
    }
    const fourHours = checkMinAdvance({
      scheduledLocal: "2026-06-01T14:00",
      minAdvanceMinutes: 180,
      nowMs,
    });
    expect(fourHours).toEqual({ ok: true });
  });

  it("measures elapsed instants across the March DST spring-forward, not wall-clock hours", () => {
    // 2026-03-29 02:00 CET → 03:00 CEST. 01:30 CET is 00:30 UTC; 03:30 CEST
    // is 01:30 UTC — one real hour, two wall-clock hours.
    const nowMs = Date.UTC(2026, 2, 29, 0, 30, 0);
    const result = checkMinAdvance({
      scheduledLocal: "2026-03-29T03:30",
      minAdvanceMinutes: 90,
      nowMs,
    });
    expect(result).toEqual({
      ok: false,
      code: "min_advance",
      params: { minutes: 90 },
    });
  });
});
