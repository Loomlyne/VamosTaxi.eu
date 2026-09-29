import { describe, expect, it, vi } from "vitest";
import { parseTripQuery } from "./trip-url";
import { buildQuoteBody, fetchQuote, keepSelection, parseQuoteJson, tripIsQuotable } from "./checkout-quote";

const GS = "11111111-1111-4111-8111-111111111111";
const url = (extra: Record<string, string> = {}) =>
  parseTripQuery({
    from: "Zurich Airport",
    fid: "dXJuOm1ieHBvaTox",
    to: "Bahnhofstrasse 1",
    tid: "dXJuOm1ieHBvaTox2",
    gs: GS,
    when: "2026-10-02T08:15",
    pax: "2",
    bags: "3",
    flight: "lx318",
    ...extra,
  }).trip;
const ctx = { locale: "en", currency: "CHF" } as const;

const okJson = {
  ok: true,
  quote_id: "q1",
  lock: "l1",
  expires_at: "2026-10-02T00:00:00Z",
  pricing_live: false,
  classes: [
    { slug: "economy", eligible: true, total_rappen: null, effective_max_pax: 3, max_bags: 3, name: "Economy" },
    { slug: "van", eligible: false, ineligible_reason: "pax", total_rappen: null, effective_max_pax: 1, max_bags: 1 },
  ],
};

describe("buildQuoteBody", () => {
  it("sends retrieve kinds and never an airport flag", () => {
    const body = buildQuoteBody(url({ class: "economy" }), ctx);
    expect(body?.pickup).toEqual({ kind: "retrieve", mapbox_id: "dXJuOm1ieHBvaTox", session_token: GS, text: "Zurich Airport" });
    expect(body?.legs[0]).toEqual({ leg_seq: 1, scheduled_local: "2026-10-02T08:15", flight_no: "LX318" });
    expect(body?.preferred_class).toBe("economy");
    expect(JSON.stringify(body)).not.toMatch(/airport"?\s*:/i);
  });
  it("mints a session when gs is missing and is null without a place id", () => {
    const body = buildQuoteBody(url({ gs: "" }), ctx);
    expect(body?.pickup.session_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(buildQuoteBody(url({ fid: "" }), ctx)).toBeNull();
    expect(tripIsQuotable(parseTripQuery({}).trip)).toBe(false);
  });
});

describe("parseQuoteJson", () => {
  it("maps classes, capacity and the too-small reason", () => {
    const r = parseQuoteJson(200, okJson);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.classes[0]).toMatchObject({ slug: "economy", eligible: true, block: null, pax: 3, bags: 3 });
    expect(r.classes[1]).toMatchObject({ eligible: false, block: "pax", name: "van" });
    expect(r.noneFit).toBe(false);
    expect(r.pricingLive).toBe(false);
  });
  it("flags no class fits", () => {
    const r = parseQuoteJson(200, { ...okJson, classes: [okJson.classes[1]] });
    expect(r.kind === "ok" && r.noneFit).toBe(true);
  });
  it("reads error codes, params and the challenge", () => {
    const e = parseQuoteJson(422, { ok: false, error: "min_advance", i18n_key: "quote.error.min_advance", params: { minutes: 180 } });
    expect(e).toMatchObject({ kind: "error", code: "min_advance", params: { minutes: 180 }, challenge: false });
    expect(parseQuoteJson(403, { ok: false, error: "turnstile_required" })).toMatchObject({ challenge: true });
    expect(parseQuoteJson(422, { ok: false, error: "pricing_not_live" })).toMatchObject({ pricingNotLive: true });
    expect(parseQuoteJson(500, null)).toMatchObject({ kind: "error", code: "unavailable" });
  });
});

describe("keepSelection", () => {
  it("clears a class that became too small", () => {
    const r = parseQuoteJson(200, okJson);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(keepSelection("economy", r.classes)).toBe("economy");
    expect(keepSelection("van", r.classes)).toBeNull();
    expect(keepSelection("gone", r.classes)).toBeNull();
    expect(keepSelection(null, r.classes)).toBeNull();
  });
});

describe("fetchQuote", () => {
  it("returns the first answer when the places resolve", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(okJson)));
    const r = await fetchQuote(f, url(), ctx);
    expect(r.kind).toBe("ok");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("falls back to suggest then retrieve under a fresh session once (A3)", async () => {
    const calls: string[] = [];
    const f = vi.fn(async (input: string, init?: RequestInit) => {
      calls.push(input.split("?")[0] as string);
      if (input.startsWith("/api/geo/suggest")) {
        return new Response(JSON.stringify({ ok: true, suggestions: [{ mapbox_id: "fresh-id", name: "x", address: "" }] }));
      }
      const body = JSON.parse(String(init?.body));
      return calls.filter((c) => c === "/api/quote").length === 1
        ? new Response(JSON.stringify({ ok: false, error: "place_unresolved", i18n_key: "quote.geo.no_results" }), { status: 422 })
        : new Response(JSON.stringify({ ...okJson, quote_id: body.pickup.mapbox_id }));
    });
    const r = await fetchQuote(f, url(), ctx);
    expect(r).toMatchObject({ kind: "ok", quoteId: "fresh-id" });
    expect(calls).toEqual(["/api/quote", "/api/geo/suggest", "/api/geo/suggest", "/api/quote"]);
  });
  it("reports place_unresolved when the fallback finds nothing, and a network failure", async () => {
    const f = vi.fn(async (input: string) =>
      input.startsWith("/api/geo/suggest")
        ? new Response(JSON.stringify({ ok: true, suggestions: [] }))
        : new Response(JSON.stringify({ ok: false, error: "place_unresolved" }), { status: 422 }),
    );
    expect(await fetchQuote(f, url(), ctx)).toMatchObject({ code: "place_unresolved" });
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchQuote(boom, url(), ctx)).toMatchObject({ kind: "error", code: "network" });
  });
});
