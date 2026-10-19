// Owner wording 2026-10-09: the booking steps sent from our server. Injected fakes only: no network, no database.
import { afterEach, describe, expect, it, vi } from "vitest";
import { funnelEventIdFor, scheduleFunnelEvent, sendFunnelEvent, type FunnelDeps, type FunnelSend } from "./funnel";

const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.IwAR0abc_DEF-123";
const SUBJECT = "a1b2c3d4-0000-4000-8000-000000002801";
const TOKEN = "fake-token-bbbb2222";
const ID = "0d9f3f9e-5a7b-4c2d-8e1f-0a1b2c3d4e5f";

const consoleSpies = ["log", "error", "warn", "info"].map((m) => vi.spyOn(console, m as "log").mockImplementation(() => {}));
afterEach(() => consoleSpies.forEach((s) => s.mockClear()));

const send: FunnelSend = { name: "AddPaymentInfo", eventId: ID, valueRappen: 9979, orderId: "VT-26-07331", fbp: FBP, fbc: FBC };

function make(over: Partial<FunnelDeps> = {}) {
  const log = vi.fn();
  const fetchFn = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
  const deps: FunnelDeps = {
    token: () => TOKEN,
    pixelId: () => "1234567890",
    testEventCode: () => null,
    livemode: () => true,
    fetch: fetchFn as unknown as typeof fetch,
    nowSeconds: () => 1727771234,
    log,
    ...over,
  };
  return { deps, log, fetchFn };
}
const bodyOf = (f: ReturnType<typeof vi.fn>) => (f.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;

describe("sendFunnelEvent", () => {
  it("flags closed: nothing leaves, nothing is read", async () => {
    const { deps, fetchFn } = make({ token: vi.fn(() => TOKEN) });
    expect(await sendFunnelEvent(send, deps, () => false)).toBe("skip");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(deps.token).not.toHaveBeenCalled();
  });

  it("the default gate is closed (2026-10-18, every Meta tag removed): nothing leaves", async () => {
    const { deps, fetchFn } = make();
    expect(await sendFunnelEvent(send, deps)).toBe("skip");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("open, live mode: one POST with the exact event, no test code", async () => {
    const { deps, fetchFn, log } = make();
    expect(await sendFunnelEvent(send, deps, () => true)).toBe("sent");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchFn);
    expect(body.get("test_event_code")).toBeNull();
    expect(JSON.parse(body.get("data")!)).toEqual([
      {
        event_name: "AddPaymentInfo",
        event_time: 1727771234,
        action_source: "website",
        event_source_url: "https://vamostaxi.site",
        event_id: ID,
        user_data: { fbp: FBP, fbc: FBC },
        custom_data: { currency: "CHF", value: 99.79, order_id: "VT-26-07331" },
      },
    ]);
    expect(log).toHaveBeenCalledWith({ event: "AddPaymentInfo", outcome: "sent", http: 200, code: null });
  });

  it("test mode needs the test event code, and sends it", async () => {
    const none = make({ livemode: () => false });
    expect(await sendFunnelEvent(send, none.deps, () => true)).toBe("skip");
    expect(none.fetchFn).not.toHaveBeenCalled();
    expect(none.log).toHaveBeenCalledWith({ event: "AddPaymentInfo", outcome: "skip", reason: "no_test_code" });
    const withCode = make({ livemode: () => false, testEventCode: () => "TEST123" });
    expect(await sendFunnelEvent(send, withCode.deps, () => true)).toBe("sent");
    expect(bodyOf(withCode.fetchFn).get("test_event_code")).toBe("TEST123");
  });

  it("a set test code is ignored on a live payment", async () => {
    const { deps, fetchFn } = make({ testEventCode: () => "TEST123" });
    expect(await sendFunnelEvent(send, deps, () => true)).toBe("sent");
    expect(bodyOf(fetchFn).get("test_event_code")).toBeNull();
  });

  it.each([null, ""])("no token %j: skip", async (t) => {
    const { deps, fetchFn } = make({ token: () => t });
    expect(await sendFunnelEvent(send, deps, () => true)).toBe("skip");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("nothing to send (no cookie id, bad amount): skip", async () => {
    for (const bad of [{ fbp: null, fbc: null }, { valueRappen: 0 }, { eventId: "VT-26-07331" }]) {
      const { deps, fetchFn } = make();
      expect(await sendFunnelEvent({ ...send, ...bad }, deps, () => true)).toBe("skip");
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it("Graph refuses: rejected, with only the status and code logged", async () => {
    const { deps, log } = make({
      fetch: vi.fn(async () => new Response(JSON.stringify({ error: { code: 100, error_subcode: 2804001, message: "secret words" } }), { status: 400 })) as unknown as typeof fetch,
    });
    expect(await sendFunnelEvent(send, deps, () => true)).toBe("rejected");
    expect(log).toHaveBeenCalledWith({ event: "AddPaymentInfo", outcome: "rejected", http: 400, code: "100.2804001" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret words");
  });

  it("a throwing fetch or logger never rejects", async () => {
    const boom = make({ fetch: vi.fn(async () => { throw new Error("net"); }) as unknown as typeof fetch });
    expect(await sendFunnelEvent(send, boom.deps, () => true)).toBe("failed");
    const loud = make({ log: () => { throw new Error("log"); } });
    await expect(sendFunnelEvent(send, loud.deps, () => true)).resolves.toBeDefined();
  });

  it("nothing logged or posted contains the token, the ids or the subject", async () => {
    const { deps, log, fetchFn } = make();
    await sendFunnelEvent(send, deps, () => true);
    const logged = JSON.stringify(log.mock.calls) + JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls));
    for (const secret of [TOKEN, FBP, FBC, SUBJECT, "VT-26-07331"]) expect(logged.includes(secret), secret).toBe(false);
    const url = (fetchFn.mock.calls[0] as unknown as [string])[0];
    expect(url.includes(TOKEN)).toBe(false);
  });
});

describe("funnelEventIdFor", () => {
  it("is a UUID, stable for one booking and step, different for another", async () => {
    const a = await funnelEventIdFor("b-1", "AddPaymentInfo");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await funnelEventIdFor("b-1", "AddPaymentInfo")).toBe(a);
    expect(await funnelEventIdFor("b-2", "AddPaymentInfo")).not.toBe(a);
    expect(await funnelEventIdFor("b-1", "InitiateCheckout")).not.toBe(a);
    expect(a.includes("b-1")).toBe(false);
  });
});

describe("scheduleFunnelEvent", () => {
  const decide = (over = {}) => ({
    cookieHeader: `consent_subject=${SUBJECT}; _fbp=${FBP}; _fbc=${FBC}`,
    origin: "https://vamostaxi.site",
    readMarketing: vi.fn(async () => true),
    ...over,
  });

  it("flags closed: nothing is scheduled, nothing is read", async () => {
    const waited: Promise<unknown>[] = [];
    const d = decide();
    const event = vi.fn(async () => {});
    await scheduleFunnelEvent({ ctx: { waitUntil: (p) => void waited.push(p) }, decide: d, allowed: () => false, event });
    expect(waited).toHaveLength(0);
    expect(d.readMarketing).not.toHaveBeenCalled();
    expect(event).not.toHaveBeenCalled();
  });

  it("open: the job goes to waitUntil, reads consent, then sends once with the two ids", async () => {
    const waited: Promise<unknown>[] = [];
    const d = decide();
    const event = vi.fn(async () => {});
    await scheduleFunnelEvent({ ctx: { waitUntil: (p) => void waited.push(p) }, decide: d, allowed: () => true, event });
    expect(waited).toHaveLength(1);
    await Promise.all(waited);
    expect(d.readMarketing).toHaveBeenCalledWith(SUBJECT);
    expect(event).toHaveBeenCalledTimes(1);
    expect(event).toHaveBeenCalledWith({ fbp: FBP, fbc: FBC });
  });

  it.each([
    ["Marketing off now", { readMarketing: vi.fn(async () => false) }],
    ["no consent subject cookie", { cookieHeader: `_fbp=${FBP}` }],
    ["no Meta cookie id", { cookieHeader: `consent_subject=${SUBJECT}` }],
    ["a dashboard Origin", { origin: "https://dashboard.vamostaxi.site" }],
    ["no Origin", { origin: null }],
    ["a consent read that throws", { readMarketing: vi.fn(async () => { throw new Error("db"); }) }],
  ])("%s: nothing is sent", async (_n, over) => {
    const event = vi.fn(async () => {});
    await scheduleFunnelEvent({ ctx: undefined, decide: decide(over), allowed: () => true, event });
    expect(event).not.toHaveBeenCalled();
  });

  it("no context: runs inline; a throwing send never rejects", async () => {
    await expect(
      scheduleFunnelEvent({ ctx: undefined, decide: decide(), allowed: () => true, event: async () => { throw new Error("x"); } }),
    ).resolves.toBeUndefined();
  });
});
