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
    });
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

  it("builds a semicolon-joined coordinate path in origin-waypoints-destination order", async () => {
    const { fetchFn, calls } = captureFetch(() =>
      jsonResponse(FIXTURE_DIRECTIONS_OK),
    );
    await routeLegs(
      [
        {
          origin: { lng: 8.54, lat: 47.37 },
          waypoints: [
            { lng: 8.55, lat: 47.38 },
            { lng: 8.56, lat: 47.39 },
          ],
          destination: { lng: 8.57, lat: 47.4 },
        },
      ],
      TOKEN_ENV,
      { fetch: fetchFn },
    );
    expect(calls).toHaveLength(1);
    const path = new URL(calls[0]!.url).pathname;
    expect(path).toContain("8.54,47.37;8.55,47.38;8.56,47.39;8.57,47.4");
    expect(new URL(calls[0]!.url).searchParams.get("radiuses")).toBe(
      "unlimited;unlimited;unlimited;unlimited",
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
