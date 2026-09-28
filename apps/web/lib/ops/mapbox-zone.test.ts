// apps/web/lib/ops/mapbox-zone.test.ts
//
// D-26: any Mapbox pin can become a service zone. Slug is from the label.
// D-10 (26.1-10): the zone is the official city, canton or airport the pick sits in.

import { describe, expect, it, vi } from "vitest";
import { retrieve } from "../geo/mapbox";
import {
  geoLanguageFromPath,
  mapboxIdFromPin,
  pgTextArrayLiteral,
  placeLabelFromPin,
  resolveZoneFromPin,
  skiZoneType,
  upsertZoneTarget,
  zoneSlugFromPlace,
  zoneTargetFromRetrieved,
  type ZoneStore,
  type ZoneStoreRow,
} from "./mapbox-zone";

describe("mapbox-zone", () => {
  it("reads mapbox_id from a pin object or a bare string", () => {
    expect(mapboxIdFromPin({ mapbox_id: "dXJu.zermatt" })).toBe("dXJu.zermatt");
    expect(mapboxIdFromPin("dXJu.zermatt")).toBe("dXJu.zermatt");
    expect(mapboxIdFromPin({})).toBe("");
  });

  it("slugs Interlaken and Zermatt without a seeded zone list", () => {
    expect(zoneSlugFromPlace("Interlaken, Switzerland", "sbx.1")).toBe(
      "interlaken-switzerland",
    );
    expect(zoneSlugFromPlace("Zermatt, Bahnhofplatz", "sbx.2")).toBe(
      "zermatt-bahnhofplatz",
    );
  });

  it("marks ski villages as ski, not other", () => {
    expect(skiZoneType("Zermatt, Bahnhofplatz")).toBe("ski");
    expect(skiZoneType("Interlaken")).toBe("other");
  });

  it("keeps the Mapbox display name for the zone label", () => {
    expect(
      placeLabelFromPin({ text: "Interlaken" }, "Interlaken, Switzerland"),
    ).toBe("Interlaken, Switzerland");
  });

  it("binds tags as a Postgres text[] literal", () => {
    expect(pgTextArrayLiteral(["mapbox:abc"])).toBe('{"mapbox:abc"}');
    expect(pgTextArrayLiteral([])).toBe("{}");
  });
});

// ── 26.1-10 (D-10): a Fixed-routes pick resolves to an official area ─────────────────────────
//
// Fixtures are Search Box /retrieve bodies run through the real retrieve() with a stub fetch,
// so the test covers the same field reading the route relies on. No live Mapbox call.

const MAPBOX_ENV = { MAPBOX_TOKEN: "test-mapbox-token-not-a-credential" };

function featureBody(properties: Record<string, unknown>, coordinates: [number, number]) {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates }, properties }],
  };
}

const ZURICH_PLACE = { mapbox_id: "dXJuOm1ieHBsYzpBYWs", name: "Zürich" };
const ZH_REGION = { region_code: "ZH", region_code_full: "CH-ZH" };

/** A street address inside the city of Zürich. */
const FIXTURE_ADDRESS_ZURICH = featureBody(
  {
    name: "Bahnhofstrasse 1",
    mapbox_id: "sbx.fixture.bahnhofstrasse-1",
    full_address: "Bahnhofstrasse 1, 8001 Zürich, Switzerland",
    feature_type: "address",
    context: { region: ZH_REGION, place: ZURICH_PLACE },
  },
  [8.5402, 47.3782],
);

/** A point of interest (museum) inside Zürich — not an airport. */
const FIXTURE_POI_MUSEUM = featureBody(
  {
    name: "Swiss National Museum",
    mapbox_id: "sbx.fixture.swiss-national-museum",
    full_address: "Museumstrasse 2, 8001 Zürich, Switzerland",
    feature_type: "poi",
    poi_category: ["museum"],
    poi_category_ids: ["museum"],
    maki: "museum",
    context: { region: ZH_REGION, place: ZURICH_PLACE },
  },
  [8.5405, 47.3793],
);

/** Zurich Airport POI — it sits in Kloten, but the pick is the airport itself. */
const FIXTURE_POI_AIRPORT = featureBody(
  {
    name: "Zurich Airport",
    mapbox_id: "sbx.fixture.zurich-airport-poi",
    full_address: "The Circle 16, 8302 Kloten, Switzerland",
    feature_type: "poi",
    poi_category: ["airport", "transportation"],
    poi_category_ids: ["airport"],
    maki: "airport",
    context: {
      region: ZH_REGION,
      place: { mapbox_id: "dXJuOm1ieHBsYzpLbG90ZW4", name: "Kloten" },
    },
  },
  [8.562, 47.45],
);

/** A canton (region feature): no city context, only the region. */
const FIXTURE_REGION_BERN = featureBody(
  {
    name: "Bern",
    mapbox_id: "dXJuOm1ieHJlZ2lvbjpCRQ",
    feature_type: "region",
    context: { region: { name: "Bern", region_code: "BE", region_code_full: "CH-BE" } },
  },
  [7.6, 46.8],
);

function retrieveWith(body: unknown, status = 200) {
  const fetchFn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch;
  return async (mapboxId: string) =>
    (
      await retrieve(
        { mapboxId, sessionToken: "00000000-0000-4000-8000-000000000000", language: "de" },
        MAPBOX_ENV,
        { fetch: fetchFn },
      )
    ).place;
}

type Inserted = { slug: string; zoneType: string; tags: string[]; name: string };

/** In-memory ZoneStore standing in for the staff transaction. */
function memoryStore(seed: ZoneStoreRow[] = []) {
  const rows: ZoneStoreRow[] = seed.map((r) => ({ ...r, tags: [...r.tags] }));
  const inserted: Inserted[] = [];
  let n = 0;
  let opened = 0;
  const store: ZoneStore = {
    async findActiveByTag(tag) {
      return rows.find((r) => r.active && r.tags.includes(tag)) ?? null;
    },
    async findBySlug(slug) {
      return rows.find((r) => r.slug === slug) ?? null;
    },
    async tagAndActivate(id, tag) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      if (!row.tags.includes(tag)) row.tags.push(tag);
      row.active = true;
      return row;
    },
    async insert(target, slug) {
      if (rows.some((r) => r.slug === slug)) return null;
      n += 1;
      const row: ZoneStoreRow = { id: `z-${n}`, slug, iata: null, active: true, tags: [...target.tags] };
      rows.push(row);
      inserted.push({ slug, zoneType: target.zoneType, tags: [...target.tags], name: target.name });
      return row;
    },
  };
  const withStore = async <T,>(fn: (s: ZoneStore) => Promise<T>): Promise<T> => {
    opened += 1;
    return fn(store);
  };
  return { rows, inserted, withStore, opened: () => opened };
}

describe("zone resolution from a Mapbox pick (D-10, 26.1-10)", () => {
  it("a street address in Zürich creates the Zürich city zone, not a street zone", async () => {
    const mem = memoryStore();
    const got = await resolveZoneFromPin(
      { mapbox_id: "sbx.fixture.bahnhofstrasse-1", text: "Bahnhofstrasse 1, 8001 Zürich" },
      { retrieve: retrieveWith(FIXTURE_ADDRESS_ZURICH), withStore: mem.withStore },
    );
    expect(got.ok).toBe(true);
    expect(mem.inserted).toEqual([
      { slug: "zurich", zoneType: "city", tags: ["mapbox_place:dXJuOm1ieHBsYzpBYWs"], name: "Zürich" },
    ]);
    // A second address in the same city reuses the zone by its place tag.
    const again = await resolveZoneFromPin(
      { mapbox_id: "sbx.fixture.bahnhofstrasse-1" },
      { retrieve: retrieveWith(FIXTURE_ADDRESS_ZURICH), withStore: mem.withStore },
    );
    expect(again.ok && again.zone.slug).toBe("zurich");
    expect(mem.inserted).toHaveLength(1);
  });

  it("a point of interest that is not an airport resolves to its city zone", async () => {
    const place = await retrieveWith(FIXTURE_POI_MUSEUM)("sbx.fixture.swiss-national-museum");
    expect(zoneTargetFromRetrieved(place)).toMatchObject({
      kind: "city",
      slug: "zurich",
      zoneType: "city",
      tags: ["mapbox_place:dXJuOm1ieHBsYzpBYWs"],
    });
  });

  it("an airport POI creates or reuses an airport zone tagged with its Mapbox id", async () => {
    const mem = memoryStore();
    const got = await resolveZoneFromPin(
      { mapbox_id: "sbx.fixture.zurich-airport-poi" },
      { retrieve: retrieveWith(FIXTURE_POI_AIRPORT), withStore: mem.withStore },
    );
    expect(got.ok).toBe(true);
    expect(mem.inserted).toEqual([
      {
        slug: "zurich-airport",
        zoneType: "airport",
        tags: ["mapbox:sbx.fixture.zurich-airport-poi"],
        name: "Zurich Airport",
      },
    ]);
    const reuse = memoryStore([
      { id: "zrh", slug: "zrh-airport", iata: "ZRH", active: true, tags: ["mapbox:sbx.fixture.zurich-airport-poi"] },
    ]);
    const again = await resolveZoneFromPin(
      { mapbox_id: "sbx.fixture.zurich-airport-poi" },
      { retrieve: retrieveWith(FIXTURE_POI_AIRPORT), withStore: reuse.withStore },
    );
    expect(again.ok && again.zone.id).toBe("zrh");
    expect(reuse.inserted).toHaveLength(0);
  });

  it("a canton (region feature) reuses canton-<code>", async () => {
    const mem = memoryStore([
      { id: "be", slug: "canton-be", iata: null, active: true, tags: ["canton:BE"] },
    ]);
    const got = await resolveZoneFromPin(
      { mapbox_id: "dXJuOm1ieHJlZ2lvbjpCRQ" },
      { retrieve: retrieveWith(FIXTURE_REGION_BERN), withStore: mem.withStore },
    );
    expect(got.ok && got.zone.id).toBe("be");
    expect(mem.inserted).toHaveLength(0);
    const place = await retrieveWith(FIXTURE_REGION_BERN)("dXJuOm1ieHJlZ2lvbjpCRQ");
    expect(zoneTargetFromRetrieved(place)).toMatchObject({
      kind: "canton",
      slug: "canton-be",
      zoneType: "canton",
      tags: ["canton:BE"],
      name: "Bern",
    });
  });

  it("a Mapbox retrieve failure answers an error and creates no zone", async () => {
    const mem = memoryStore();
    const got = await resolveZoneFromPin(
      { mapbox_id: "sbx.fixture.bahnhofstrasse-1" },
      { retrieve: retrieveWith({ message: "upstream" }, 500), withStore: mem.withStore },
    );
    expect(got).toEqual({ ok: false, reason: "retrieve-failed" });
    expect(mem.opened()).toBe(0);
    expect(mem.inserted).toHaveLength(0);
  });

  it("a pick with no Mapbox id is refused before any lookup", async () => {
    const mem = memoryStore();
    const lookups = vi.fn();
    const got = await resolveZoneFromPin(
      { text: "Bahnhofstrasse 1" },
      { retrieve: async (id) => { lookups(id); return null; }, withStore: mem.withStore },
    );
    expect(got).toEqual({ ok: false, reason: "no-pin" });
    expect(lookups).not.toHaveBeenCalled();
  });

  it("a same-name city in another canton gets its own zone, never the first city's", async () => {
    const mem = memoryStore([
      { id: "wil-sg", slug: "wil", iata: null, active: true, tags: ["mapbox_place:wil-sg-id"] },
    ]);
    const target = zoneTargetFromRetrieved({
      mapbox_id: "sbx.fixture.wil-zh-address",
      name: "Dorfstrasse 1",
      canton: "ZH",
      cityId: "wil-zh-id",
      cityName: "Wil",
      isAirport: false,
    });
    expect(target).not.toBeNull();
    const zone = await mem.withStore((s) => upsertZoneTarget(target!, s));
    expect(zone?.slug).toBe("wil-zh");
    expect(mem.rows.find((r) => r.id === "wil-sg")?.tags).toEqual(["mapbox_place:wil-sg-id"]);
  });

  it("a seeded zone with the same slug and no place tag is reused and tagged", async () => {
    const mem = memoryStore([
      { id: "zermatt", slug: "zermatt", iata: null, active: true, tags: ["ski"] },
    ]);
    const target = zoneTargetFromRetrieved({
      mapbox_id: "sbx.fixture.zermatt-address",
      name: "Bahnhofplatz 1",
      canton: "VS",
      cityId: "zermatt-id",
      cityName: "Zermatt",
      isAirport: false,
    });
    expect(target?.zoneType).toBe("ski");
    const zone = await mem.withStore((s) => upsertZoneTarget(target!, s));
    expect(zone?.id).toBe("zermatt");
    expect(zone?.tags).toEqual(["ski", "mapbox_place:zermatt-id"]);
    expect(mem.inserted).toHaveLength(0);
  });

  it("slugs strip accents instead of splitting the word", () => {
    expect(zoneSlugFromPlace("Zürich", "x")).toBe("zurich");
    expect(zoneSlugFromPlace("Genève", "x")).toBe("geneve");
  });

  it("reads the staff language from the route path, defaulting to en", () => {
    expect(geoLanguageFromPath("/de/api/staff/rate-book")).toBe("de");
    expect(geoLanguageFromPath("/ar/api/staff/rate-book")).toBe("ar");
    expect(geoLanguageFromPath("/api/staff/rate-book")).toBe("en");
  });
});

