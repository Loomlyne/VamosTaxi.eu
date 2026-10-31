import { describe, expect, it, vi } from "vitest";
import { parseTripQuery } from "./trip-url";
import { buildQuoteBody, fetchQuote, keepSelection, kmFigure, parseQuoteJson, tripIsQuotable } from "./checkout-quote";

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
  it("asks again for the same places under a fresh session, once (A3)", async () => {
    const bodies: { pickup: { mapbox_id: string; session_token: string }; dropoff: { mapbox_id: string } }[] = [];
    const f = vi.fn(async (_input: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return bodies.length === 1
        ? new Response(JSON.stringify({ ok: false, error: "place_unresolved", i18n_key: "quote.geo.no_results" }), { status: 422 })
        : new Response(JSON.stringify(okJson));
    });
    expect(await fetchQuote(f, url(), ctx)).toMatchObject({ kind: "ok" });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.pickup.mapbox_id).toBe(bodies[0]?.pickup.mapbox_id);
    expect(bodies[1]?.dropoff.mapbox_id).toBe(bodies[0]?.dropoff.mapbox_id);
    expect(bodies[1]?.pickup.session_token).not.toBe(bodies[0]?.pickup.session_token);
  });
  it("never searches for the words: a place that stays unresolved stays refused", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (input: string) => {
      urls.push(input);
      return new Response(JSON.stringify({ ok: false, error: "place_unresolved", i18n_key: "quote.geo.no_results" }), { status: 422 });
    });
    expect(await fetchQuote(f, url(), ctx)).toMatchObject({ code: "place_unresolved", i18nKey: "quote.geo.no_results" });
    expect(urls).toEqual(["/api/quote", "/api/quote"]);
  });
  it.each([
    ["the pickup", { fid: "" }],
    ["the drop-off", { tid: "" }],
    ["both ends", { fid: "", tid: "" }],
  ])("a trip with no chosen place for %s is not quotable and asks nothing", async (_label, over) => {
    const f = vi.fn(async () => new Response(JSON.stringify(okJson)));
    expect(tripIsQuotable(url(over))).toBe(false);
    expect(await fetchQuote(f, url(over), ctx)).toMatchObject({ kind: "error", code: "trip_incomplete" });
    expect(f).not.toHaveBeenCalled();
  });
  it("reports a network failure", async () => {
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await fetchQuote(boom, url(), ctx)).toMatchObject({ kind: "error", code: "network" });
  });
});

describe("trip distance (booking polish)", () => {
  const ok = (route: unknown) =>
    parseQuoteJson(200, { ok: true, quote_id: "q", lock: "l", classes: [], ...(route === undefined ? {} : { route }) });

  it("reads the server's route metres and never makes one up", () => {
    const withRoute = ok({ legs: [{ leg_seq: 1, distance_m: 148_230, road: true }] });
    expect(withRoute.kind === "ok" && withRoute.distanceM).toBe(148_230);
    const none = ok(undefined);
    expect(none.kind === "ok" && none.distanceM).toBeNull();
    const notRoad = ok({ legs: [{ leg_seq: 1, distance_m: 9_000, road: false }] });
    expect(notRoad.kind === "ok" && notRoad.distanceM).toBeNull();
    const zero = ok({ legs: [{ leg_seq: 1, distance_m: 0 }] });
    expect(zero.kind === "ok" && zero.distanceM).toBeNull();
  });

  it("writes the figure with one decimal", () => {
    expect(kmFigure(148_230)).toBe("148.2");
    expect(kmFigure(18_000)).toBe("18.0");
    expect(kmFigure(18_449)).toBe("18.4");
    expect(kmFigure(null)).toBeNull();
    expect(kmFigure(0)).toBeNull();
  });

  it("no road on any leg: the words, never a partial sum", () => {
    const one = ok({ legs: [{ leg_seq: 1, distance_m: 9_000, road: false }] });
    expect(one.kind === "ok" && one.noRoad).toBe(true);
    const mixed = ok({
      legs: [
        { leg_seq: 1, distance_m: 100_000, road: true },
        { leg_seq: 2, distance_m: 9_000, road: false },
      ],
    });
    expect(mixed.kind === "ok" && mixed.noRoad).toBe(true);
    expect(mixed.kind === "ok" && mixed.distanceM).toBeNull();
  });

  it("road legs or no route at all are not a no-road trip", () => {
    const road = ok({ legs: [{ leg_seq: 1, distance_m: 148_230, road: true }] });
    expect(road.kind === "ok" && road.noRoad).toBe(false);
    const legacy = ok({ legs: [{ leg_seq: 1, distance_m: 148_230 }] });
    expect(legacy.kind === "ok" && legacy.noRoad).toBe(false);
    const none = ok(undefined);
    expect(none.kind === "ok" && none.noRoad).toBe(false);
  });
});
