// apps/web/lib/meta/capi.test.ts
// Phase 29 plan 29-03: payload contract (exact keys) and the single POST. Fake fetch only.
import { describe, expect, it, vi } from "vitest";
import { buildFunnelEvent, buildPurchaseEvent, metaTestEventToSend, postPurchase, GRAPH_VERSION, PURCHASE_EVENT_SOURCE_URL } from "./capi";

const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.AbCdEfGh";
const TOKEN = "fake-token-for-tests";
const PIXEL = "1234567890";
const base = { eventId: "e1", eventTimeSeconds: 1727771234, chargedRappen: 12000 };

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  }
  return out;
}

const ALLOWED = new Set([
  "event_name", "event_time", "action_source", "event_source_url", "event_id",
  "user_data", "custom_data", "fbp", "fbc", "currency", "value", "order_id",
]);

describe("buildPurchaseEvent", () => {
  it("builds the locked event", () => {
    const e = buildPurchaseEvent({ ...base, fbp: FBP, fbc: null })!;
    expect(Object.keys(e).sort()).toEqual(
      ["action_source", "custom_data", "event_id", "event_name", "event_source_url", "event_time", "user_data"],
    );
    expect(e.event_name).toBe("Purchase");
    expect(e.action_source).toBe("website");
    expect(e.event_source_url).toBe("https://vamostaxi.site");
    expect(PURCHASE_EVENT_SOURCE_URL).toBe("https://vamostaxi.site");
    expect(e.event_id).toBe("e1");
    expect(e.user_data).toEqual({ fbp: FBP });
    expect(e.custom_data).toEqual({ currency: "CHF", value: 120 });
  });
  it("keeps fractions as a number", () => {
    const e = buildPurchaseEvent({ ...base, chargedRappen: 12050, fbp: null, fbc: FBC })!;
    expect(e.custom_data.value).toBe(120.5);
    expect(e.user_data).toEqual({ fbc: FBC });
    expect(buildPurchaseEvent({ ...base, fbp: FBP, fbc: FBC })!.user_data).toEqual({ fbp: FBP, fbc: FBC });
  });
  it("returns null for bad amounts or no ids", () => {
    for (const c of [0, -1, 1.5, NaN]) expect(buildPurchaseEvent({ ...base, chargedRappen: c, fbp: FBP, fbc: null })).toBeNull();
    expect(buildPurchaseEvent({ ...base, fbp: null, fbc: null })).toBeNull();
  });
  it("walks every key: nothing outside the allowed set", () => {
    for (const ids of [{ fbp: FBP, fbc: null }, { fbp: null, fbc: FBC }, { fbp: FBP, fbc: FBC }]) {
      const e = buildPurchaseEvent({ ...base, ...ids })!;
      for (const k of allKeys(e)) expect(ALLOWED.has(k)).toBe(true);
    }
  });
});

describe("order_id (owner decision 2026-10-09, D4)", () => {
  it("the Purchase carries the booking reference as order_id and nothing else changes", () => {
    const e = buildPurchaseEvent({ ...base, fbp: FBP, fbc: null, orderId: "VT-26-07331" })!;
    expect(e.custom_data).toEqual({ currency: "CHF", value: 120, order_id: "VT-26-07331" });
    expect(JSON.stringify(e)).toBe(JSON.stringify({ ...e, custom_data: { currency: "CHF", value: 120, order_id: "VT-26-07331" } }));
  });
  it("no reference, an empty one or one that is not a booking reference: no order_id key at all", () => {
    for (const orderId of [undefined, null, "", "VT-26-1", "a@b.com", "VT-26-07331 ", "vt-26-07331"]) {
      const e = buildPurchaseEvent({ ...base, fbp: FBP, fbc: null, orderId })!;
      expect("order_id" in e.custom_data, String(orderId)).toBe(false);
    }
  });
});

describe("buildFunnelEvent (InitiateCheckout, AddPaymentInfo)", () => {
  const ID = "0d9f3f9e-5a7b-4c2d-8e1f-0a1b2c3d4e5f";
  const f = { name: "InitiateCheckout" as const, eventId: ID, eventTimeSeconds: 1727771234, valueRappen: 9979, fbp: FBP, fbc: null };
  it("builds the locked event: the name, the amount, the cookie ids, the fixed address, no reference before a booking exists", () => {
    const e = buildFunnelEvent(f)!;
    expect(Object.keys(e).sort()).toEqual(["action_source", "custom_data", "event_id", "event_name", "event_source_url", "event_time", "user_data"]);
    expect(e.event_name).toBe("InitiateCheckout");
    expect(e.event_source_url).toBe("https://vamostaxi.site");
    expect(e.user_data).toEqual({ fbp: FBP });
    expect(e.custom_data).toEqual({ currency: "CHF", value: 99.79 });
  });
  it("AddPaymentInfo carries the reference as order_id", () => {
    const e = buildFunnelEvent({ ...f, name: "AddPaymentInfo", orderId: "VT-26-07331" })!;
    expect(e.event_name).toBe("AddPaymentInfo");
    expect(e.custom_data).toEqual({ currency: "CHF", value: 99.79, order_id: "VT-26-07331" });
  });
  it("null for a bad amount, no ids, or an id that is not a UUID", () => {
    for (const v of [0, -5, 1.5, NaN, 5_000_001]) expect(buildFunnelEvent({ ...f, valueRappen: v })).toBeNull();
    expect(buildFunnelEvent({ ...f, fbp: null, fbc: null })).toBeNull();
    for (const id of ["", "e1", "VT-26-07331", `${ID}x`]) expect(buildFunnelEvent({ ...f, eventId: id })).toBeNull();
  });
  it("walks every key: nothing outside the allowed set", () => {
    for (const name of ["InitiateCheckout", "AddPaymentInfo"] as const) {
      const e = buildFunnelEvent({ ...f, name, fbc: FBC, orderId: "VT-26-07331" })!;
      for (const k of allKeys(e)) expect(ALLOWED.has(k), k).toBe(true);
    }
  });
});

function res(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

describe("postPurchase", () => {
  const event = buildPurchaseEvent({ ...base, fbp: FBP, fbc: FBC })!;

  it("sends one POST with the token in the body only", async () => {
    const f = vi.fn(async () => res(200, { events_received: 1 }));
    const out = await postPurchase(f as unknown as typeof fetch, { event, token: TOKEN, pixelId: PIXEL, testEventCode: null });
    expect(out).toEqual({ state: "sent", http: 200, code: null, subcode: null });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL}/events`);
    expect(url).not.toContain("?");
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("access_token")).toBe(TOKEN);
    expect(body.has("test_event_code")).toBe(false);
    const data = JSON.parse(body.get("data")!);
    expect(data).toEqual([event]);
    for (const k of allKeys(data)) expect(ALLOWED.has(k)).toBe(true);
  });

  it("adds the test event code only when given", async () => {
    const f = vi.fn(async () => res(200, { events_received: 1 }));
    await postPurchase(f as unknown as typeof fetch, { event, token: TOKEN, pixelId: PIXEL, testEventCode: "TEST123" });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as URLSearchParams).get("test_event_code")).toBe("TEST123");
  });

  it("classifies a refusal with code and subcode only", async () => {
    const f = vi.fn(async () =>
      res(400, { error: { code: 100, error_subcode: 2804050, fbtrace_id: "x", message: "secret-echo" } }),
    );
    const out = await postPurchase(f as unknown as typeof fetch, { event, token: TOKEN, pixelId: PIXEL, testEventCode: null });
    expect(out).toEqual({ state: "rejected", http: 400, code: 100, subcode: 2804050 });
    expect(Object.keys(out).sort()).toEqual(["code", "http", "state", "subcode"]);
  });

  it("classifies 5xx, throw, abort and odd 200 as failed, without retry", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => res(500, { error: { code: 1 } }),
      async () => { throw new Error("boom"); },
      async () => { throw new DOMException("timeout", "AbortError"); },
      async () => res(200, {}),
      async () => res(200, "not json"),
    ];
    for (const c of cases) {
      const f = vi.fn(c);
      const out = await postPurchase(f as unknown as typeof fetch, { event, token: TOKEN, pixelId: PIXEL, testEventCode: null });
      expect(out.state).toBe("failed");
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
});

describe("metaTestEventToSend", () => {
  it("ignores a code on a live payment, and skips a test payment that has none", () => {
    expect(metaTestEventToSend(true, "TEST123")).toEqual({ sendCode: null, skip: false });
    expect(metaTestEventToSend(true, null)).toEqual({ sendCode: null, skip: false });
    expect(metaTestEventToSend(true, "")).toEqual({ sendCode: null, skip: false });
    expect(metaTestEventToSend(false, "TEST123")).toEqual({ sendCode: "TEST123", skip: false });
    expect(metaTestEventToSend(false, null)).toEqual({ sendCode: null, skip: true });
    expect(metaTestEventToSend(false, "")).toEqual({ sendCode: null, skip: true });
  });
});
