// apps/web/lib/flight/aerodatabox.test.ts
//
// Behaviour proofs for lookupFlight — one shot, never the first record,
// three named degradations, no invented buffer. Injected fetch; no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FLIGHT_NUMBER_RE,
  lookupFlight,
  normaliseFlightNumber,
} from "./aerodatabox";
import {
  EMPTY_ARRAY,
  FAILURE_STATUSES,
  OVERNIGHT_TWO_RECORDS,
  SINGLE_ALL_TIMES,
  SINGLE_CEST,
  SINGLE_NO_OPTIONALS,
  SINGLE_REVISED_AND_SCHEDULED,
  SINGLE_SCHEDULED_ONLY,
} from "./fixtures";

const here = dirname(fileURLToPath(import.meta.url));
const KEY = "test-flight-key";
const PINNED_NOW = new Date("2026-03-20T12:00:00.000Z");

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response,
): { fetch: typeof globalThis.fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return impl(url, init);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("normaliseFlightNumber", () => {
  it("strips spaces and uppercases", () => {
    expect(normaliseFlightNumber("lx 318")).toBe("LX318");
  });

  it("strips hyphens and uppercases", () => {
    expect(normaliseFlightNumber("LX-318")).toBe("LX318");
  });

  it("uppercases a compact number", () => {
    expect(normaliseFlightNumber("lx318")).toBe("LX318");
  });
});

describe("FLIGHT_NUMBER_RE", () => {
  it("accepts LX318, U24321 and AB1", () => {
    expect(FLIGHT_NUMBER_RE.test("LX318")).toBe(true);
    expect(FLIGHT_NUMBER_RE.test("U24321")).toBe(true);
    expect(FLIGHT_NUMBER_RE.test("AB1")).toBe(true);
  });

  it("rejects L318, LX, LX12345 and LX318A", () => {
    expect(FLIGHT_NUMBER_RE.test("L318")).toBe(false);
    expect(FLIGHT_NUMBER_RE.test("LX")).toBe(false);
    expect(FLIGHT_NUMBER_RE.test("LX12345")).toBe(false);
    expect(FLIGHT_NUMBER_RE.test("LX318A")).toBe(false);
  });
});

describe("lookupFlight — refusals before fetch", () => {
  it("returns malformed without calling fetch", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(SINGLE_ALL_TIMES));
    const result = await lookupFlight(
      { number: "L318" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({ code: "malformed" });
    expect(calls).toHaveLength(0);
  });

  it("returns provider_unavailable with no key and does not fetch", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(SINGLE_ALL_TIMES));
    const result = await lookupFlight({ number: "LX318" }, {}, { fetch });
    expect(result).toMatchObject({ code: "provider_unavailable" });
    expect(calls).toHaveLength(0);
  });
});

describe("lookupFlight — landing_source ladder", () => {
  it("uses actual when runwayTime is present", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_ALL_TIMES));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({
      flight: { landing_source: "actual", number: "LX318" },
    });
  });

  it("uses estimated when runwayTime is absent", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_REVISED_AND_SCHEDULED));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({ flight: { landing_source: "estimated" } });
  });

  it("uses scheduled when only scheduledTime is present", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_SCHEDULED_ONLY));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({ flight: { landing_source: "scheduled" } });
  });
});

describe("lookupFlight — no buffer", () => {
  it("does not carry buffer_minutes on a successful result", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_ALL_TIMES));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).not.toHaveProperty("buffer_minutes");
    if ("flight" in result && result.flight) {
      expect(result.flight).not.toHaveProperty("buffer_minutes");
    }
  });
});

describe("lookupFlight — never the first record", () => {
  it("disambiguates two records with both candidates and no flight field", async () => {
    const { fetch } = mockFetch(() => jsonResponse(OVERNIGHT_TWO_RECORDS));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({ action: "disambiguate" });
    expect(result).not.toHaveProperty("flight");
    if ("candidates" in result) {
      expect(result.candidates).toHaveLength(2);
    } else {
      expect.fail("expected candidates");
    }
  });
});

describe("lookupFlight — unmappable records", () => {
  it("returns not_found when two records come back and neither can be mapped", async () => {
    const unmappable = [
      { number: "LX318", departure: { airport: { iata: "LHR" } }, arrival: { airport: { iata: "ZRH" } } },
      { number: "LX318", departure: { airport: { iata: "LHR" } }, arrival: { airport: { iata: "ZRH" } } },
    ];
    const { fetch } = mockFetch(() => jsonResponse(unmappable));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(result).not.toHaveProperty("candidates");
  });
});

describe("lookupFlight — empty and upstream failures", () => {
  it("returns not_found on an empty array", async () => {
    const { fetch } = mockFetch(() => jsonResponse(EMPTY_ARRAY));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({ code: "not_found" });
  });

  it.each(FAILURE_STATUSES)(
    "returns provider_unavailable on HTTP %s",
    async (status) => {
      const { fetch } = mockFetch(() => jsonResponse({ message: "nope" }, status));
      const result = await lookupFlight(
        { number: "LX318", date: "2026-01-15" },
        { FLIGHT_API_KEY: KEY },
        { fetch },
      );
      expect(result).toMatchObject({ code: "provider_unavailable" });
    },
  );

  it("returns provider_unavailable on a fetch timeout", async () => {
    const { fetch } = mockFetch(() => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({ code: "provider_unavailable" });
  });
});

describe("lookupFlight — Europe/Zurich landing_local", () => {
  it("formats January CET from landing_at", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_SCHEDULED_ONLY));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({
      flight: { landing_local: "2026-01-15T11:15" },
    });
  });

  it("formats July CEST from landing_at", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_CEST));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-07-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({
      flight: { landing_local: "2026-07-15T12:15" },
    });
  });
});

describe("lookupFlight — date on the request path", () => {
  it("puts a caller-supplied pickup civil date on the path", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(SINGLE_ALL_TIMES));
    await lookupFlight(
      { number: "LX318", date: "2026-05-22" },
      { FLIGHT_API_KEY: KEY },
      { fetch, now: PINNED_NOW },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/flights/number/LX318/2026-05-22");
  });

  it("falls back to today's Zurich civil date when none is supplied", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(SINGLE_ALL_TIMES));
    await lookupFlight(
      { number: "LX318" },
      { FLIGHT_API_KEY: KEY },
      { fetch, now: PINNED_NOW },
    );
    expect(calls).toHaveLength(1);
    // 12:00 UTC on 2026-03-20 is still 13:00 Europe/Zurich on the same civil day.
    expect(calls[0]?.url).toContain("/flights/number/LX318/2026-03-20");
  });
});

describe("lookupFlight — optional fields", () => {
  it("carries terminal, gate and baggage_belt when present", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_ALL_TIMES));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    expect(result).toMatchObject({
      flight: { terminal: "1", gate: "B32", baggage_belt: "3" },
    });
  });

  it("omits terminal, gate and baggage_belt when absent", async () => {
    const { fetch } = mockFetch(() => jsonResponse(SINGLE_NO_OPTIONALS));
    const result = await lookupFlight(
      { number: "LX318", date: "2026-01-15" },
      { FLIGHT_API_KEY: KEY },
      { fetch },
    );
    if (!("flight" in result) || !result.flight) {
      expect.fail("expected a flight");
      return;
    }
    expect(result.flight).not.toHaveProperty("terminal");
    expect(result.flight).not.toHaveProperty("gate");
    expect(result.flight).not.toHaveProperty("baggage_belt");
  });
});

describe("aerodatabox.ts source rules", () => {
  it("contains no poll, no buffer_minutes, no first-record index, and Europe/Zurich + disambiguate", () => {
    const src = readFileSync(join(here, "aerodatabox.ts"), "utf8");
    const code = src
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/setInterval/);
    expect(code).not.toMatch(/buffer_minutes/);
    expect(code).not.toMatch(/\[0\]/);
    expect(src).toMatch(/Europe\/Zurich/);
    expect(src).toMatch(/disambiguate/);
    expect(src).not.toMatch(/\b60\b/);
  });
});
