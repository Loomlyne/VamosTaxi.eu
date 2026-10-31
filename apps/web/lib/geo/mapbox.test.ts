// apps/web/lib/geo/mapbox.test.ts
//
// Offline proofs for the Mapbox client (D-14, D-15, D-16, D-47, D-51).
// Injected fetch doubles only — no token, no network, no live Mapbox.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  FIXTURE_DIRECTIONS_EMPTY_ROUTES,
  FIXTURE_DIRECTIONS_NO_ROUTE,
  FIXTURE_DIRECTIONS_OK,
  FIXTURE_RETRIEVE_OK,
  FIXTURE_REVERSE_EMPTY,
  FIXTURE_REVERSE_OK,
  FIXTURE_SUGGEST_OK,
  FIXTURE_TILEQUERY_EMPTY,
  FIXTURE_TILEQUERY_LOCAL,
  FIXTURE_TILEQUERY_MAJOR,
  FIXTURE_UPSTREAM_500,
} from "./fixtures";
import {
  MAPBOX_FETCH_TIMEOUT_MS,
  airportsFirst,
  toRoadEnds,
  exactNameFirst,
  retrieve,
  reverse,
  routeLegs,
  suggest,
} from "./mapbox";
import { sphereMetres } from "./serviceArea";

const TOKEN_ENV = { MAPBOX_TOKEN: "test-mapbox-token-not-a-credential" };
const NO_TOKEN_ENV = {};

const ZURICH_HB = { lng: 8.5417, lat: 47.3769 };
const ZRH = { lng: 8.562, lat: 47.45 };

const LANGUAGES = ["en", "de", "fr", "ar"] as const;

const SESSION = "00000000-0000-4000-8000-000000000001";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function captureFetch(
  responder: (url: string) => Response | Promise<Response>,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push({ url, init });
    return responder(url);
  };
  return { fetchFn, calls };
}

function lastQueryKeys(url: string): string[] {
  return [...new URL(url).searchParams.keys()];
}

describe("suggest", () => {
  it("returns an empty list without calling fetch when q is shorter than 2 characters", async () => {
    const fetchFn = vi.fn();
    const result = await suggest(
      { q: "z", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result).toEqual({ suggestions: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns an empty list without calling fetch when q is only spaces", async () => {
    const fetchFn = vi.fn();
    const result = await suggest(
      { q: "  ", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result).toEqual({ suggestions: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns the degraded shape and never fetches when MAPBOX_TOKEN is absent (D-47)", async () => {
    const fetchFn = vi.fn();
    const result = await suggest(
      { q: "zurich", sessionToken: SESSION, language: "en" },
      NO_TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result).toEqual({ suggestions: [], degraded: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("derives kind from feature_type, poi_category, ids and maki; a name decides only Station and HB", async () => {
    const mk = (name: string, extra: Record<string, unknown>) => ({
      mapbox_id: `sbx.${name}`,
      name,
      ...extra,
    });
    const { fetchFn } = captureFetch(() =>
      jsonResponse({
        suggestions: [
          mk("Zurich Airport Hotel", { feature_type: "poi", poi_category: ["hotel"] }),
          mk("Flughafen", { feature_type: "poi", poi_category: ["airport"] }),
          mk("Airport Inn", { feature_type: "poi", poi_category_ids: ["lodging"] }),
          mk("Hauptbahnhof", { feature_type: "poi", poi_category: ["railway station"] }),
          mk("Metro", { feature_type: "poi", maki: "rail-metro" }),
          mk("Zoo", { feature_type: "poi", poi_category: ["zoo"] }),
          mk("Bahnhofstrasse 21", { feature_type: "address" }),
          mk("Bahnhofstrasse", { feature_type: "street" }),
          mk("Zürich", { feature_type: "place" }),
          mk("8001", { feature_type: "postcode" }),
          mk("Altstadt", { feature_type: "neighborhood" }),
          mk("Unknown", {}),
        ],
      }),
    );
    const result = await suggest(
      { q: "zurich", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    const kinds = Object.fromEntries(result.suggestions.map((s) => [s.name, s.kind]));
    expect(kinds).toEqual({
      "Zurich Airport Hotel": "hotel",
      Flughafen: "airport",
      "Airport Inn": "hotel",
      Hauptbahnhof: "station",
      Metro: "station",
      Zoo: "poi",
      "Bahnhofstrasse 21": "address",
      Bahnhofstrasse: "address",
      Zürich: "city",
      "8001": "city",
      Altstadt: "place",
      Unknown: "poi",
    });
  });

  describe("station by name (owner 2026-10-04)", () => {
    async function kindsOf(
      entries: { name: string; extra: Record<string, unknown> }[],
    ): Promise<Record<string, string>> {
      const { fetchFn } = captureFetch(() =>
        jsonResponse({
          suggestions: entries.map((e) => ({
            mapbox_id: `sbx.${e.name}`,
            name: e.name,
            ...e.extra,
          })),
        }),
      );
      const result = await suggest(
        { q: "zurich", sessionToken: SESSION, language: "en" },
        TOKEN_ENV,
        { fetch: fetchFn },
      );
      return Object.fromEntries(result.suggestions.map((s) => [s.name, s.kind]));
    }
    const poi = { feature_type: "poi" };

    it("maps 'Zurich Main Station' and 'Zürich HB' to station without any rail category", async () => {
      expect(
        await kindsOf([
          { name: "Zurich Main Station", extra: poi },
          { name: "Zürich HB", extra: poi },
          { name: "Bern HB", extra: poi },
          { name: "Basel Station", extra: { feature_type: "neighborhood" } },
        ]),
      ).toEqual({
        "Zurich Main Station": "station",
        "Zürich HB": "station",
        "Bern HB": "station",
        "Basel Station": "station",
      });
    });

    it("allows trailing whitespace or punctuation after the final Station or HB, nothing else", async () => {
      expect(
        await kindsOf([
          { name: "Zurich Main Station ", extra: poi },
          { name: "Zurich Main Station.", extra: poi },
          { name: "Zürich HB)", extra: poi },
          { name: "Zürich HB ", extra: poi },
          { name: "ZURICH MAIN STATION", extra: poi },
        ]),
      ).toEqual({
        "Zurich Main Station ": "station",
        "Zurich Main Station.": "station",
        "Zürich HB)": "station",
        "Zürich HB ": "station",
        "ZURICH MAIN STATION": "station",
      });
    });

    it("only a name that ENDS with Station or HB is a station (owner follow-up 2026-10-04 14:54)", async () => {
      expect(
        await kindsOf([
          { name: "The cozy house - 15 min to Zurich main station", extra: poi },
          { name: "The cozy house \u2013 15 min to Zurich main station", extra: poi },
          { name: "Station Hotel Zurich", extra: poi },
          { name: "station zurich", extra: poi },
          { name: "Zürich HB Sihlquai", extra: poi },
          { name: "Station Road Garage", extra: { feature_type: "neighborhood" } },
          { name: "Zurich Main Station Taxi Rank", extra: poi },
        ]),
      ).toEqual({
        "The cozy house - 15 min to Zurich main station": "poi",
        "The cozy house \u2013 15 min to Zurich main station": "poi",
        "Station Hotel Zurich": "poi",
        "station zurich": "poi",
        "Zürich HB Sihlquai": "poi",
        "Station Road Garage": "place",
        "Zurich Main Station Taxi Rank": "poi",
      });
    });

    it("matches Station and HB as whole words only, and HB in capitals only", async () => {
      expect(
        await kindsOf([
          { name: "Stationsstrasse Garage", extra: poi },
          { name: "Substation 12", extra: poi },
          { name: "Hb Zurich", extra: poi },
          { name: "Zurich hb", extra: poi },
          { name: "HBF Zurich", extra: poi },
          { name: "SHB Arena", extra: poi },
        ]),
      ).toEqual({
        "Stationsstrasse Garage": "poi",
        "Substation 12": "poi",
        "Hb Zurich": "poi",
        "Zurich hb": "poi",
        "HBF Zurich": "poi",
        "SHB Arena": "poi",
      });
    });

    it("keeps an airport an airport even when its name says Station or HB", async () => {
      expect(
        await kindsOf([
          { name: "Zurich Airport Station", extra: { ...poi, poi_category: ["airport"] } },
          { name: "Zürich HB Airport Shuttle", extra: { ...poi, maki: "airport" } },
        ]),
      ).toEqual({
        "Zurich Airport Station": "airport",
        "Zürich HB Airport Shuttle": "airport",
      });
    });

    it("lets Mapbox's own category win over the name: a hotel named Station stays a hotel", async () => {
      expect(
        await kindsOf([
          { name: "Station Hotel Zurich", extra: { ...poi, poi_category: ["hotel"] } },
          { name: "Hotel Zürich HB", extra: { ...poi, poi_category_ids: ["lodging"] } },
          { name: "Station Inn", extra: { ...poi, maki: "lodging" } },
        ]),
      ).toEqual({
        "Station Hotel Zurich": "hotel",
        "Hotel Zürich HB": "hotel",
        "Station Inn": "hotel",
      });
    });

    it("never turns a street, address or city into a station by name", async () => {
      expect(
        await kindsOf([
          { name: "Station Road 4", extra: { feature_type: "address" } },
          { name: "Station Road", extra: { feature_type: "street" } },
          { name: "Station", extra: { feature_type: "place" } },
          { name: "HB", extra: { feature_type: "locality" } },
        ]),
      ).toEqual({
        "Station Road 4": "address",
        "Station Road": "address",
        Station: "city",
        HB: "city",
      });
    });
  });

  describe("airports first (owner 2026-10-04)", () => {
    const airport = { feature_type: "poi", poi_category: ["airport"], maki: "airport" };

    async function idsFor(
      entries: { id: string; extra: Record<string, unknown> }[],
    ): Promise<string[]> {
      const { fetchFn } = captureFetch(() =>
        jsonResponse({
          suggestions: entries.map((e) => ({
            mapbox_id: e.id,
            name: e.id,
            ...e.extra,
          })),
        }),
      );
      const result = await suggest(
        { q: "zur", sessionToken: SESSION, language: "en" },
        TOKEN_ENV,
        { fetch: fetchFn },
      );
      return result.suggestions.map((h) => h.mapbox_id);
    }

    it("puts the airport first for 'zur' and keeps Mapbox's order for the rest", async () => {
      const ids = await idsFor([
        { id: "Zürich", extra: { feature_type: "place" } },
        { id: "Zurich", extra: { feature_type: "place" } },
        { id: "Bad Zurzach", extra: { feature_type: "place" } },
        { id: "Zur Frohen Aussicht", extra: { feature_type: "address" } },
        { id: "Zurich Airport", extra: airport },
        { id: "Zurich Main Station", extra: { feature_type: "poi" } },
      ]);
      expect(ids).toEqual([
        "Zurich Airport",
        "Zürich",
        "Zurich",
        "Bad Zurzach",
        "Zur Frohen Aussicht",
        "Zurich Main Station",
      ]);
    });

    it("leaves Mapbox's order exactly as it is when no suggestion is an airport", async () => {
      const entries = [
        { id: "Zürich", extra: { feature_type: "place" } },
        { id: "Zurich Main Station", extra: { feature_type: "poi" } },
        { id: "Hotel Baur", extra: { feature_type: "poi", poi_category: ["hotel"] } },
        { id: "Bahnhofstrasse", extra: { feature_type: "street" } },
      ];
      expect(await idsFor(entries)).toEqual(entries.map((e) => e.id));
    });

    it("keeps two airports in their Mapbox order, ahead of everything else", async () => {
      const ids = await idsFor([
        { id: "Zürich", extra: { feature_type: "place" } },
        { id: "Basel Airport", extra: airport },
        { id: "Hotel Baur", extra: { feature_type: "poi", poi_category: ["hotel"] } },
        { id: "Zurich Airport", extra: airport },
        { id: "Zürich HB", extra: { feature_type: "poi" } },
      ]);
      expect(ids).toEqual([
        "Basel Airport",
        "Zurich Airport",
        "Zürich",
        "Hotel Baur",
        "Zürich HB",
      ]);
    });

    it("puts a place named exactly what was typed first, ignoring case and accents", () => {
      const hit = (name: string) => ({ name });
      const names = (q: string, list: string[]) => exactNameFirst(list.map(hit), q).map((h) => h.name);
      expect(names("Zug", ["ZügelPartner GmbH", "Zug", "Zug Marina"])).toEqual(["Zug", "ZügelPartner GmbH", "Zug Marina"]);
      expect(names(" zurich ", ["Zurich Airport", "Zürich"])).toEqual(["Zürich", "Zurich Airport"]);
      expect(names("zur", ["Zürich", "Zurzach"])).toEqual(["Zürich", "Zurzach"]);
    });

    it("an airport stays ahead of an exact name", async () => {
      const { fetchFn } = captureFetch(() =>
        jsonResponse({
          suggestions: [
            { mapbox_id: "zurich", name: "Zurich", feature_type: "place" },
            { mapbox_id: "airport", name: "Zurich Airport", ...airport },
          ],
        }),
      );
      const result = await suggest({ q: "zurich", sessionToken: SESSION, language: "en" }, TOKEN_ENV, { fetch: fetchFn });
      expect(result.suggestions.map((h) => h.mapbox_id)).toEqual(["airport", "zurich"]);
    });

    it("airportsFirst is stable and returns an empty list as is", () => {
      const hit = (id: string, kind: "airport" | "city") => ({
        mapbox_id: id,
        name: id,
        address: "",
        context: "",
        kind,
      });
      expect(airportsFirst([])).toEqual([]);
      expect(
        airportsFirst([hit("a", "city"), hit("b", "airport"), hit("c", "city"), hit("d", "airport")]).map(
          (h) => h.mapbox_id,
        ),
      ).toEqual(["b", "d", "a", "c"]);
    });
  });

  it("maps four fixture suggestions without any coordinate field", async () => {
    const { fetchFn, calls } = captureFetch(() =>
      jsonResponse(FIXTURE_SUGGEST_OK),
    );
    const result = await suggest(
      { q: "zurich", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.degraded).toBeUndefined();
    expect(result.suggestions).toHaveLength(4);
    for (const hit of result.suggestions) {
      expect(hit).toEqual({
        mapbox_id: expect.any(String),
        name: expect.any(String),
        address: expect.any(String),
        context: expect.any(String),
        kind: expect.stringMatching(
          /^(airport|hotel|station|address|city|place|poi)$/,
        ),
      });
      expect(hit).not.toHaveProperty("lng");
      expect(hit).not.toHaveProperty("lat");
      expect(hit).not.toHaveProperty("longitude");
      expect(hit).not.toHaveProperty("latitude");
      expect(hit).not.toHaveProperty("coordinates");
    }
    expect(result.suggestions.map((s) => s.mapbox_id)).toEqual([
      "sbx.fixture.zurich-hb",
      "sbx.fixture.zurich-airport",
      "sbx.fixture.bahnhofstrasse",
      "sbx.fixture.zurich-old-town",
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/"lng"/);
    expect(serialized).not.toMatch(/"lat"/);
    expect(serialized).not.toMatch(/"coordinates"/);
    expect(calls).toHaveLength(1);
    expect(lastQueryKeys(calls[0]!.url).at(-1)).toBe("access_token");
  });

  it("does not send country= — search is worldwide, quote serviceArea is the gate", async () => {
    const { fetchFn, calls } = captureFetch(() => jsonResponse(FIXTURE_SUGGEST_OK));
    await suggest(
      { q: "dubai airport", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(calls).toHaveLength(1);
    const params = new URL(calls[0]!.url).searchParams;
    expect(params.has("country")).toBe(false);
    expect(params.has("types")).toBe(false);
    expect(params.get("limit")).toBe("10");
    expect(params.get("q")).toBe("dubai airport");
    expect(params.get("proximity")).toBeTruthy();
  });

  it("calls Search Box for a two-character IATA prefix", async () => {
    const { fetchFn, calls } = captureFetch(() => jsonResponse(FIXTURE_SUGGEST_OK));
    await suggest(
      { q: "ZR", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).searchParams.get("q")).toBe("ZR");
  });

  it("returns the degraded shape on a 500, not a throw", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_UPSTREAM_500, 500));
    const result = await suggest(
      { q: "zurich", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result).toEqual({ suggestions: [], degraded: true });
  });

  it("returns the degraded shape on a fetch rejection, not a throw", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new Error("network down");
    };
    const result = await suggest(
      { q: "zurich", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result).toEqual({ suggestions: [], degraded: true });
  });
});

describe("language= on all three read paths (I-05)", () => {
  it.each(LANGUAGES)(
    "forwards language=%s on suggest, retrieve, and reverse",
    async (language) => {
      const { fetchFn, calls } = captureFetch((url) => {
        if (url.includes("/suggest")) return jsonResponse(FIXTURE_SUGGEST_OK);
        if (url.includes("/retrieve/")) return jsonResponse(FIXTURE_RETRIEVE_OK);
        return jsonResponse(FIXTURE_REVERSE_OK);
      });
      await suggest(
        { q: "zurich", sessionToken: SESSION, language },
        TOKEN_ENV,
        { fetch: fetchFn },
      );
      await retrieve(
        { mapboxId: "sbx.fixture.zurich-hb", sessionToken: SESSION, language },
        TOKEN_ENV,
        { fetch: fetchFn },
      );
      await reverse({ lng: 8.5417, lat: 47.3769, language }, TOKEN_ENV, {
        fetch: fetchFn,
      });
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(new URL(call.url).searchParams.get("language")).toBe(language);
      }
      const retrieveCall = calls.find((c) => c.url.includes("/retrieve/"));
      expect(retrieveCall).toBeDefined();
      expect(new URL(retrieveCall!.url).searchParams.has("language")).toBe(true);
    },
  );
});

describe("retrieve / reverse", () => {
  it("retrieve and reverse degrade to place: null with no token and no fetch (D-47)", async () => {
    const fetchFn = vi.fn();
    const retrieved = await retrieve(
      {
        mapboxId: "sbx.fixture.zurich-hb",
        sessionToken: SESSION,
        language: "en",
      },
      NO_TOKEN_ENV,
      { fetch: fetchFn },
    );
    const reversed = await reverse(
      { lng: 8.5417, lat: 47.3769, language: "de" },
      NO_TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(retrieved).toEqual({ place: null });
    expect(reversed).toEqual({ place: null });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("retrieve maps the fixture place including coordinates", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_RETRIEVE_OK));
    const result = await retrieve(
      {
        mapboxId: "sbx.fixture.zurich-hb",
        sessionToken: SESSION,
        language: "en",
      },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.place).toEqual({
      mapbox_id: "sbx.fixture.zurich-hb",
      name: "Zürich HB",
      address: "Museumstrasse 1, 8001 Zürich, Switzerland",
      lng: 8.5402,
      lat: 47.3782,
      canton: null,
      cityId: null,
      cityName: null,
      isAirport: false,
    });
  });

  it("reverse against an empty feature list returns place: null, not an error", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_REVERSE_EMPTY));
    const result = await reverse(
      { lng: 8.5417, lat: 47.3769, language: "fr" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result).toEqual({ place: null });
  });

  it("reverse maps the fixture place", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_REVERSE_OK));
    const result = await reverse(
      { lng: 8.5417, lat: 47.3769, language: "ar" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.place).toEqual({
      name: "Museumstrasse 1",
      address: "Museumstrasse 1, 8001 Zürich, Switzerland",
      lng: 8.5417,
      lat: 47.3769,
      canton: null,
      cityId: null,
      cityName: null,
      isAirport: false,
    });
  });
});

describe("retrieve / reverse — city id, city name, airport flag, canton on pins (D-10, D-08b, 26.1-09)", () => {
  /** Search Box `/retrieve` of an address inside Zürich (city + canton context). */
  const FIXTURE_RETRIEVE_ZURICH_CITY = Object.freeze({
    type: "FeatureCollection",
    features: Object.freeze([
      Object.freeze({
        type: "Feature",
        geometry: Object.freeze({
          type: "Point",
          coordinates: Object.freeze([8.5402, 47.3782]) as [number, number],
        }),
        properties: Object.freeze({
          name: "Bahnhofstrasse 1",
          mapbox_id: "sbx.fixture.bahnhofstrasse-1",
          full_address: "Bahnhofstrasse 1, 8001 Zürich, Switzerland",
          feature_type: "address",
          context: Object.freeze({
            region: Object.freeze({ region_code: "ZH", region_code_full: "CH-ZH" }),
            place: Object.freeze({
              mapbox_id: "dXJuOm1ieHBsYzpBYWs",
              name: "Zürich",
            }),
          }),
        }),
      }),
    ]),
  });

  /** Same fixture, Arabic display name for the city — mapbox_id (the identity) is unchanged. */
  const FIXTURE_RETRIEVE_ZURICH_CITY_AR = Object.freeze({
    ...FIXTURE_RETRIEVE_ZURICH_CITY,
    features: Object.freeze([
      Object.freeze({
        ...FIXTURE_RETRIEVE_ZURICH_CITY.features[0]!,
        properties: Object.freeze({
          ...FIXTURE_RETRIEVE_ZURICH_CITY.features[0]!.properties,
          context: Object.freeze({
            ...FIXTURE_RETRIEVE_ZURICH_CITY.features[0]!.properties.context,
            place: Object.freeze({
              mapbox_id: "dXJuOm1ieHBsYzpBYWs",
              name: "زيورخ",
            }),
          }),
        }),
      }),
    ]),
  });

  /** Search Box `/retrieve` of Zurich Airport — POI category names the airport. */
  const FIXTURE_RETRIEVE_AIRPORT = Object.freeze({
    type: "FeatureCollection",
    features: Object.freeze([
      Object.freeze({
        type: "Feature",
        geometry: Object.freeze({
          type: "Point",
          coordinates: Object.freeze([8.562, 47.45]) as [number, number],
        }),
        properties: Object.freeze({
          name: "Zurich Airport",
          mapbox_id: "sbx.fixture.zurich-airport-poi",
          full_address: "Flughafen Zürich, 8058 Kloten, Switzerland",
          feature_type: "poi",
          poi_category: Object.freeze(["airport", "transportation"]),
          poi_category_ids: Object.freeze(["airport"]),
          maki: "airport",
          context: Object.freeze({
            region: Object.freeze({ region_code: "ZH", region_code_full: "CH-ZH" }),
            place: Object.freeze({
              mapbox_id: "dXJuOm1ieHBsYzpLbG90ZW4",
              name: "Kloten",
            }),
          }),
        }),
      }),
    ]),
  });

  /** Geocoding v6 `/reverse` of a pin with full context (city + canton). */
  const FIXTURE_REVERSE_ZURICH_CITY = Object.freeze({
    type: "FeatureCollection",
    features: Object.freeze([
      Object.freeze({
        type: "Feature",
        geometry: Object.freeze({
          type: "Point",
          coordinates: Object.freeze([8.5417, 47.3769]) as [number, number],
        }),
        properties: Object.freeze({
          name: "Museumstrasse 1",
          full_address: "Museumstrasse 1, 8001 Zürich, Switzerland",
          place_formatted: "Zürich, Switzerland",
          feature_type: "address",
          context: Object.freeze({
            region: Object.freeze({ region_code: "ZH", region_code_full: "CH-ZH" }),
            place: Object.freeze({
              mapbox_id: "dXJuOm1ieHBsYzpBYWs",
              name: "Zürich",
            }),
          }),
        }),
      }),
    ]),
  });

  it("retrieve of an address in Zürich resolves cityId from context.place.mapbox_id, cityName, canton ZH, isAirport false", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_RETRIEVE_ZURICH_CITY));
    const result = await retrieve(
      { mapboxId: "sbx.fixture.bahnhofstrasse-1", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.place?.cityId).toBe("dXJuOm1ieHBsYzpBYWs");
    expect(result.place?.cityName).toBe("Zürich");
    expect(result.place?.canton).toBe("ZH");
    expect(result.place?.isAirport).toBe(false);
  });

  it("retrieve of Zurich Airport POI (poi_category/poi_category_ids/maki) resolves isAirport true and canton ZH", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_RETRIEVE_AIRPORT));
    const result = await retrieve(
      { mapboxId: "sbx.fixture.zurich-airport-poi", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.place?.isAirport).toBe(true);
    expect(result.place?.canton).toBe("ZH");
  });

  it("the same place requested in language=ar resolves an identical cityId and canton (names may differ)", async () => {
    const { fetchFn } = captureFetch((url) =>
      url.includes("language=ar")
        ? jsonResponse(FIXTURE_RETRIEVE_ZURICH_CITY_AR)
        : jsonResponse(FIXTURE_RETRIEVE_ZURICH_CITY),
    );
    const en = await retrieve(
      { mapboxId: "sbx.fixture.bahnhofstrasse-1", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    const ar = await retrieve(
      { mapboxId: "sbx.fixture.bahnhofstrasse-1", sessionToken: SESSION, language: "ar" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(ar.place?.cityId).toBe(en.place?.cityId);
    expect(ar.place?.canton).toBe(en.place?.canton);
    expect(ar.place?.cityName).not.toBe(en.place?.cityName);
  });

  it("reverse of a pin populates canton and cityId from context when present", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_REVERSE_ZURICH_CITY));
    const result = await reverse(
      { lng: 8.5417, lat: 47.3769, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.place?.cityId).toBe("dXJuOm1ieHBsYzpBYWs");
    expect(result.place?.canton).toBe("ZH");
  });

  it("reverse of a pin with no context returns nulls, never a guess", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_REVERSE_OK));
    const result = await reverse(
      { lng: 8.5417, lat: 47.3769, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.place?.cityId).toBeNull();
    expect(result.place?.canton).toBeNull();
    expect(result.place?.isAirport).toBe(false);
  });
});

describe("routeLegs", () => {
  const oneLeg = [{ origin: ZURICH_HB, destination: ZRH }];

  it("issues exactly one fetch for a one-leg journey, including when four classes will share it (D-16)", async () => {
    const { fetchFn, calls } = captureFetch(() =>
      jsonResponse(FIXTURE_DIRECTIONS_OK),
    );
    const result = await routeLegs(oneLeg, TOKEN_ENV, { fetch: fetchFn });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/directions/v5/mapbox/driving/");
    expect(calls[0]!.url).not.toContain("driving-traffic");
  });

  it("issues exactly two fetches for a two-leg return journey", async () => {
    const { fetchFn, calls } = captureFetch(() =>
      jsonResponse(FIXTURE_DIRECTIONS_OK),
    );
    const result = await routeLegs(
      [
        { origin: ZURICH_HB, destination: ZRH },
        { origin: ZRH, destination: ZURICH_HB },
      ],
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.legs).toHaveLength(2);
      expect(result.legs[0]!.leg_seq).toBe(1);
      expect(result.legs[1]!.leg_seq).toBe(2);
    }
    expect(calls).toHaveLength(2);
  });

  it("truncates distance_m and duration_s and carries geometry through unchanged", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_DIRECTIONS_OK));
    const result = await routeLegs(oneLeg, TOKEN_ENV, { fetch: fetchFn });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const leg = result.legs[0]!;
      expect(leg.distance_m).toBe(12345);
      expect(leg.duration_s).toBe(1234);
      expect(Number.isInteger(leg.distance_m)).toBe(true);
      expect(Number.isInteger(leg.duration_s)).toBe(true);
      expect(leg.geometry).toEqual(FIXTURE_DIRECTIONS_OK.routes[0]!.geometry);
    }
  });

  it("returns route_unavailable on a 5xx and produces no number", async () => {
    const { fetchFn } = captureFetch(() => jsonResponse(FIXTURE_UPSTREAM_500, 502));
    const result = await routeLegs(oneLeg, TOKEN_ENV, { fetch: fetchFn });
    expect(result).toEqual({ ok: false, code: "route_unavailable" });
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });

  it("returns route_unavailable on a timeout and produces no number", async () => {
    const fetchFn: typeof fetch = async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    };
    const result = await routeLegs(oneLeg, TOKEN_ENV, { fetch: fetchFn });
    expect(result).toEqual({ ok: false, code: "route_unavailable" });
    expect("distance_m" in result).toBe(false);
  });

  it("uses Mapbox sphere metres when driving returns NoRoute", async () => {
    const { fetchFn, calls } = captureFetch((url) => {
      if (url.includes("/tilequery/")) {
        return jsonResponse(FIXTURE_TILEQUERY_EMPTY);
      }
      return jsonResponse(FIXTURE_DIRECTIONS_NO_ROUTE);
    });
    const result = await routeLegs(oneLeg, TOKEN_ENV, { fetch: fetchFn });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const leg = result.legs[0]!;
    expect(leg.distance_m).toBe(Math.trunc(sphereMetres(ZURICH_HB, ZRH)));
    expect(leg.distance_m).toBeGreaterThan(0);
    expect(leg.road).toBe(false);
    expect(calls.some((c) => c.url.includes("/directions/v5/mapbox/driving/"))).toBe(
      true,
    );
  });

  it("uses Mapbox sphere metres when routes is empty", async () => {
    const { fetchFn } = captureFetch((url) => {
      if (url.includes("/tilequery/")) {
        return jsonResponse(FIXTURE_TILEQUERY_EMPTY);
      }
      return jsonResponse(FIXTURE_DIRECTIONS_EMPTY_ROUTES);
    });
    const result = await routeLegs(oneLeg, TOKEN_ENV, { fetch: fetchFn });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.legs[0]!.distance_m).toBe(
      Math.trunc(sphereMetres(ZURICH_HB, ZRH)),
    );
    expect(result.legs[0]!.road).toBe(false);
  });

  it("retries driving after moving a car-free pin toward the other Mapbox place", async () => {
    let directions = 0;
    const { fetchFn, calls } = captureFetch((url) => {
      if (url.includes("/tilequery/")) {
        if (url.includes("8.562,47.45") || url.includes("8.5417,47.3769")) {
          return jsonResponse(FIXTURE_TILEQUERY_LOCAL);
        }
        return jsonResponse(FIXTURE_TILEQUERY_MAJOR);
      }
      directions += 1;
      if (directions === 1) return jsonResponse(FIXTURE_DIRECTIONS_NO_ROUTE);
      return jsonResponse(FIXTURE_DIRECTIONS_OK);
    });
    const result = await routeLegs(oneLeg, TOKEN_ENV, { fetch: fetchFn });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.legs[0]!.distance_m).toBe(12345);
    expect(result.legs[0]!.road).toBe(true);
    const second = calls.filter((c) =>
      c.url.includes("/directions/v5/mapbox/driving/"),
    )[1];
    expect(second).toBeDefined();
    expect(second!.url).toContain("7.7795,46.0678");
  });

  describe("car-free towns", () => {
    const ROAD_END = { lng: 7.77495977, lat: 46.06771131 };
    const ZERMATT_STATION = { lng: 7.7479, lat: 46.0237 };
    const TOWN_EDGE = { lng: 7.7491, lat: 46.0007 }; // Furi side, 2.2 km from the centre

    it("measures a trip to Zermatt to the road end at Täsch", async () => {
      const { fetchFn, calls } = captureFetch(() => jsonResponse(FIXTURE_DIRECTIONS_OK));
      const result = await routeLegs([{ origin: ZRH, destination: ZERMATT_STATION }], TOKEN_ENV, { fetch: fetchFn });
      expect(result.ok && result.legs[0]!.road).toBe(true);
      expect(calls[0]!.url).toContain(`${ROAD_END.lng},${ROAD_END.lat}`);
      expect(calls[0]!.url).not.toContain("7.7479");
    });
    it("does the same for a trip from anywhere in town", () => {
      expect(toRoadEnds({ origin: TOWN_EDGE, destination: ZRH })).toEqual({ origin: ROAD_END, destination: ZRH });
    });
    it("leaves other trips, and Täsch itself, alone", () => {
      const plain = { origin: ZURICH_HB, destination: ZRH };
      expect(toRoadEnds(plain)).toEqual(plain);
      const tasch = { origin: ZRH, destination: ROAD_END };
      expect(toRoadEnds(tasch)).toEqual(tasch);
    });
    it("a trip between Täsch and Zermatt keeps its own pins, both ways, so it keeps a fare", () => {
      const fromTerminal = { origin: ROAD_END, destination: ZERMATT_STATION };
      expect(toRoadEnds(fromTerminal)).toEqual(fromTerminal);
      const toVillage = { origin: ZERMATT_STATION, destination: { lng: 7.7779, lat: 46.0704 } };
      expect(toRoadEnds(toVillage)).toEqual(toVillage);
    });
    it("a road that fails still falls back to the booked place, not the road end", async () => {
      const { fetchFn } = captureFetch((url) =>
        url.includes("/tilequery/") ? jsonResponse(FIXTURE_TILEQUERY_EMPTY) : jsonResponse(FIXTURE_DIRECTIONS_NO_ROUTE),
      );
      const result = await routeLegs([{ origin: ZRH, destination: ZERMATT_STATION }], TOKEN_ENV, { fetch: fetchFn });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.legs[0]!.road).toBe(false);
      expect(result.legs[0]!.distance_m).toBe(Math.trunc(sphereMetres(ZRH, ZERMATT_STATION)));
    });
    it("return trips measure both legs to the road end", async () => {
      const { fetchFn, calls } = captureFetch(() => jsonResponse(FIXTURE_DIRECTIONS_OK));
      await routeLegs(
        [{ origin: ZRH, destination: ZERMATT_STATION }, { origin: ZERMATT_STATION, destination: ZRH }],
        TOKEN_ENV,
        { fetch: fetchFn },
      );
      expect(calls).toHaveLength(2);
      for (const call of calls) expect(call.url).toContain(`${ROAD_END.lng},${ROAD_END.lat}`);
    });
    it("a trip inside Zermatt keeps its own pins", () => {
      const within = { origin: ZERMATT_STATION, destination: TOWN_EDGE };
      expect(toRoadEnds(within)).toEqual(within);
    });
  });

  it("uses Mapbox sphere metres from USA to China when driving has no ocean line", async () => {
    const nyc = { lng: -74.006, lat: 40.7128 };
    const beijing = { lng: 116.4074, lat: 39.9042 };
    const { fetchFn } = captureFetch((url) => {
      if (url.includes("/tilequery/")) {
        return jsonResponse(FIXTURE_TILEQUERY_EMPTY);
      }
      return jsonResponse(FIXTURE_DIRECTIONS_NO_ROUTE);
    });
    const result = await routeLegs(
      [{ origin: nyc, destination: beijing }],
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.legs[0]!.distance_m).toBe(
      Math.trunc(sphereMetres(nyc, beijing)),
    );
    expect(result.legs[0]!.distance_m).toBeGreaterThan(10_000_000);
    expect(result.legs[0]!.road).toBe(false);
  });

  it("builds the coordinate path from origin and destination only; a stop list is ignored (26.2-p4 D)", async () => {
    const { fetchFn, calls } = captureFetch(() =>
      jsonResponse(FIXTURE_DIRECTIONS_OK),
    );
    const withStops = {
      origin: { lng: 8.54, lat: 47.37 },
      waypoints: [
        { lng: 8.55, lat: 47.38 },
        { lng: 8.56, lat: 47.39 },
      ],
      destination: { lng: 8.57, lat: 47.4 },
    } as unknown as Parameters<typeof routeLegs>[0][number];
    await routeLegs([withStops], TOKEN_ENV, { fetch: fetchFn });
    expect(calls).toHaveLength(1);
    const path = new URL(calls[0]!.url).pathname;
    expect(path).toContain("8.54,47.37;8.57,47.4");
    expect(path).not.toContain("8.55,47.38");
    expect(new URL(calls[0]!.url).searchParams.get("radiuses")).toBe(
      "unlimited;unlimited",
    );
  });

  it("returns route_unavailable with no fetch when MAPBOX_TOKEN is absent (D-47)", async () => {
    const fetchFn = vi.fn();
    const result = await routeLegs(oneLeg, NO_TOKEN_ENV, { fetch: fetchFn });
    expect(result).toEqual({ ok: false, code: "route_unavailable" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("timeout + no-cache invariants", () => {
  it("sets AbortSignal.timeout on every upstream call", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const { fetchFn } = captureFetch((url) => {
      if (url.includes("/suggest")) return jsonResponse(FIXTURE_SUGGEST_OK);
      if (url.includes("/retrieve/")) return jsonResponse(FIXTURE_RETRIEVE_OK);
      if (url.includes("/reverse")) return jsonResponse(FIXTURE_REVERSE_OK);
      return jsonResponse(FIXTURE_DIRECTIONS_OK);
    });
    await suggest(
      { q: "zurich", sessionToken: SESSION, language: "en" },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    await retrieve(
      {
        mapboxId: "sbx.fixture.zurich-hb",
        sessionToken: SESSION,
        language: "en",
      },
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    await reverse({ lng: 8.5417, lat: 47.3769, language: "en" }, TOKEN_ENV, {
      fetch: fetchFn,
    });
    await routeLegs([{ origin: ZURICH_HB, destination: ZRH }], TOKEN_ENV, {
      fetch: fetchFn,
    });
    expect(timeoutSpy).toHaveBeenCalled();
    for (const call of timeoutSpy.mock.calls) {
      expect(call[0]).toBe(MAPBOX_FETCH_TIMEOUT_MS);
    }
    expect(timeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    timeoutSpy.mockRestore();
  });

  it("executable source contains none of the forbidden cache / profile / persist identifiers", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "mapbox.ts"), "utf8");
    const executable = src
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(executable).not.toMatch(/GEO_CACHE/);
    expect(executable).not.toMatch(/QUOTE_ABUSE/);
    expect(executable).not.toMatch(/caches\.default/);
    expect(executable).not.toMatch(/\.put\(/);
    expect(executable).not.toMatch(/driving-traffic/);
    expect(executable).not.toMatch(/directions-matrix/);
    expect(executable).not.toMatch(/permanent/);
    expect(executable).not.toMatch(/console\./);
  });
});
