// POST /api/track (owner wording 2026-10-09): InitiateCheckout is sent by our server. The route answers 204 for
// every well-formed request and never says whether anything went to Meta.
import { beforeEach, describe, expect, it, vi } from "vitest";

const SUBJECT = "a1b2c3d4-0000-4000-8000-000000002801";
const FBP = "fb.1.1727771234567.1234567890";
const ID = "0d9f3f9e-5a7b-4c2d-8e1f-0a1b2c3d4e5f";

const state = {
  allowed: true,
  marketing: true,
  limited: false,
  waited: [] as Promise<unknown>[],
  posts: [] as { url: string; body: URLSearchParams }[],
  live: true,
  testCode: undefined as string | undefined,
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      ["META_CAPI_" + "ACCESS_TOKEN"]: "fake-token",
      META_TEST_EVENT_CODE: state.testCode,
      STRIPE_PUBLISHABLE_KEY: state.live ? "pk_live_x" : "pk_test_x",
      QUOTE_RATE_LIMITER: { limit: async () => ({ success: !state.limited }) },
    },
    ctx: { waitUntil: (p: Promise<unknown>) => void state.waited.push(p) },
  }),
}));
vi.mock("@/lib/db/identity", () => ({ asCheckout: async (_e: unknown, _n: unknown, fn: (sql: unknown) => unknown) => fn({}) }));
vi.mock("@/lib/consent/read", () => ({ readConsentChoice: async () => ({ marketing: state.marketing }) }));
vi.mock("@/lib/meta/legal-gate", async (orig) => ({ ...(await orig<object>()), metaEventsAllowed: () => state.allowed }));

import { POST } from "../../app/api/track/route";

beforeEach(() => {
  state.allowed = true;
  state.marketing = true;
  state.limited = false;
  state.waited = [];
  state.posts = [];
  state.live = true;
  state.testCode = undefined;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    state.posts.push({ url: String(url), body: (init as { body: URLSearchParams }).body });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://vamostaxi.site/api/track", {
    method: "POST",
    headers: {
      origin: "https://vamostaxi.site",
      "content-type": "application/json",
      cookie: `consent_subject=${SUBJECT}; _fbp=${FBP}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const good = { event: "InitiateCheckout", id: ID, value_rappen: 9979 };

describe("POST /api/track", () => {
  it("open, consent on, a cookie id: 204 and one InitiateCheckout posted from the background", async () => {
    const res = await POST(req(good));
    expect(res.status).toBe(204);
    await Promise.all(state.waited);
    expect(state.posts).toHaveLength(1);
    const ev = JSON.parse(state.posts[0]!.body.get("data")!)[0];
    expect(ev).toMatchObject({
      event_name: "InitiateCheckout",
      event_id: ID,
      user_data: { fbp: FBP },
      custom_data: { currency: "CHF", value: 99.79 },
      event_source_url: "https://vamostaxi.site",
    });
    expect("order_id" in ev.custom_data).toBe(false);
  });

  it("flags closed: 204, no background job, nothing posted", async () => {
    state.allowed = false;
    expect((await POST(req(good))).status).toBe(204);
    expect(state.waited).toHaveLength(0);
    expect(state.posts).toHaveLength(0);
  });

  it("Marketing off now: 204 and nothing posted", async () => {
    state.marketing = false;
    expect((await POST(req(good))).status).toBe(204);
    await Promise.all(state.waited);
    expect(state.posts).toHaveLength(0);
  });

  it("live mode ignores a test code", async () => {
    state.live = true;
    state.testCode = "TEST123";
    expect((await POST(req(good))).status).toBe(204);
    await Promise.all(state.waited);
    expect(state.posts[0]!.body.has("test_event_code")).toBe(false);
  });

  it("test mode without a test code: nothing posted; with one it goes with the code", async () => {
    state.live = false;
    expect((await POST(req(good))).status).toBe(204);
    await Promise.all(state.waited);
    expect(state.posts).toHaveLength(0);
    state.waited = [];
    state.testCode = "TEST123";
    await POST(req(good));
    await Promise.all(state.waited);
    expect(state.posts[0]!.body.get("test_event_code")).toBe("TEST123");
  });

  it("no Origin, or a foreign or dashboard one: 403 and nothing posted", async () => {
    for (const origin of ["https://evil.test", "https://dashboard.vamostaxi.site"]) {
      expect((await POST(req(good, { origin }))).status).toBe(403);
    }
    const noOrigin = new Request("https://vamostaxi.site/api/track", { method: "POST", body: JSON.stringify(good) });
    expect((await POST(noOrigin)).status).toBe(403);
    await Promise.all(state.waited);
    expect(state.posts).toHaveLength(0);
  });

  it.each([
    ["not JSON", "{"],
    ["a different event", { ...good, event: "Purchase" }],
    ["an extra key", { ...good, email: "a@b.c" }],
    ["a missing key", { event: "InitiateCheckout", id: ID }],
    ["an id that is not a UUID", { ...good, id: "VT-26-07331" }],
    ["a zero amount", { ...good, value_rappen: 0 }],
    ["a fractional amount", { ...good, value_rappen: 10.5 }],
    ["a huge amount", { ...good, value_rappen: 99_999_999 }],
    ["a string amount", { ...good, value_rappen: "9979" }],
    ["an array", [good]],
  ])("%s: 400 and nothing posted", async (_n, body) => {
    expect((await POST(req(body))).status).toBe(400);
    await Promise.all(state.waited);
    expect(state.posts).toHaveLength(0);
  });

  it("rate limited: 429", async () => {
    state.limited = true;
    expect((await POST(req(good))).status).toBe(429);
    expect(state.posts).toHaveLength(0);
  });

  it("the answer never carries a body", async () => {
    const res = await POST(req(good));
    expect(await res.text()).toBe("");
  });
});
