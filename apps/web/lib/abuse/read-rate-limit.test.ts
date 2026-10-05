// apps/web/lib/abuse/read-rate-limit.test.ts
//
// Security S12 (2026-10-05): the public database reads are rate limited on READ_RATE_LIMITER
// (namespace 1012), one key per route and address, and a refused read never reaches the database.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAllowed, readRateKey, readRateLimited, type ReadRoute } from "./read-rate-limit";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const state = { allow: false, db: 0, keys: [] as string[] };

vi.mock("@opennextjs/cloudflare", () => {
  const env = {
    READ_RATE_LIMITER: {
      limit: async ({ key }: { key: string }) => {
        state.keys.push(key);
        return { success: state.allow };
      },
    },
    QUOTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    HYPERDRIVE: { connectionString: "postgres://unused" },
  };
  return { getCloudflareContext: () => ({ env }) };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null, publicSiteOrigin: () => "https://vamostaxi.site" }));
vi.mock("@/lib/db/identity", () => {
  const touch = async () => {
    state.db += 1;
    throw new Error("the database must not be asked");
  };
  return { asGuest: touch, asCheckout: touch, asCustomer: touch, asSystem: touch, asStaff: touch };
});
vi.mock("@/lib/db/public", () => ({
  publicSql: () => async () => {
    state.db += 1;
    throw new Error("the database must not be asked");
  },
}));

import { GET as statusGet } from "../../app/api/checkout/status/[ref]/route";
import { nextPollDelayMs } from "../checkout/status-poll";
import { GET as resumeGet } from "../../app/api/checkout/resume/route";
import { GET as manageGet } from "../../app/api/manage/booking/route";
import { POST as payLinkOpen } from "../../app/api/checkout/pay-link/open/route";
import { GET as reviewsGet } from "../../app/api/reviews/route";

const IP = { "cf-connecting-ip": "203.0.113.7" };
const TOKEN = "q0Zk3s1Yt8vQb5nW2xR7cL9mJ4hF6dG1aE3sT5uV7wY";

describe("read limiter keys and fail-open", () => {
  it("one key per route and address; IPv6 is cut to its /64", () => {
    const v4 = new Request("https://vamostaxi.site/x", { headers: IP });
    const v6 = new Request("https://vamostaxi.site/x", { headers: { "cf-connecting-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" } });
    const routes: ReadRoute[] = ["status", "resume", "manage", "paylink", "lockexpire", "reviews"];
    expect(new Set(routes.map((r) => readRateKey(r, v4))).size).toBe(routes.length);
    expect(readRateKey("status", v4)).toBe("read:status:203.0.113.7");
    expect(readRateKey("status", v6)).toBe("read:status:2001:db8:1:2::/64");
  });

  it("a missing binding or a limiter that throws lets the read through; a refusal does not", async () => {
    const req = new Request("https://vamostaxi.site/x", { headers: IP });
    expect(await readAllowed(undefined, "status", req)).toBe(true);
    expect(await readAllowed({ limit: async () => { throw new Error("down"); } } as never, "status", req)).toBe(true);
    expect(await readAllowed({ limit: async () => ({ success: false }) } as never, "status", req)).toBe(false);
    expect(await readAllowed({ limit: async () => ({ success: true }) } as never, "status", req)).toBe(true);
  });

  it("the refusal is 429, private, never cached", async () => {
    const res = readRateLimited();
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("retry-after")).toBe("60");
  });
});

describe("S12: every public database read answers 429 before the database when over the limit", () => {
  beforeEach(() => {
    state.allow = false;
    state.db = 0;
    state.keys = [];
  });

  it("checkout status poll: 429 with the shape the poll reads as nothing new", async () => {
    const res = await statusGet(new Request("https://vamostaxi.site/api/checkout/status/VT-26-0101", { headers: IP }), {
      params: Promise.resolve({ ref: "VT-26-0101" }),
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ visible: false });
    expect(state.keys).toEqual(["read:status:203.0.113.7"]);
    expect(state.db).toBe(0);
  });

  // 261005 review follow-up (S12): a limited poll is an HTTP 429 with a Retry-After the confirmation page
  // honours (status-poll.ts), never a 200 {visible:false} it would answer with another poll a second later.
  it("checkout status poll: the 429 carries a Retry-After the client turns into a back-off", async () => {
    const res = await statusGet(new Request("https://vamostaxi.site/api/checkout/status/VT-26-0101", { headers: IP }), {
      params: Promise.resolve({ ref: "VT-26-0101" }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(nextPollDelayMs(res.status, res.headers.get("retry-after"), 0)).toBe(60_000);
  });

  it("checkout resume: 429 with state none", async () => {
    const res = await resumeGet(
      new Request("https://vamostaxi.site/api/checkout/resume?quote=00000000-0000-4000-8000-000000000001", {
        headers: { ...IP, cookie: `vt_manage=${TOKEN}` },
      }),
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ state: "none" });
    expect(state.keys).toEqual(["read:resume:203.0.113.7"]);
    expect(state.db).toBe(0);
  });

  it("manage booking read: 429", async () => {
    const res = await manageGet(
      new Request("https://vamostaxi.site/api/manage/booking", { headers: { ...IP, cookie: `vt_manage=${TOKEN}` } }),
    );
    expect(res.status).toBe(429);
    expect(state.keys).toEqual(["read:manage:203.0.113.7"]);
    expect(state.db).toBe(0);
  });

  it("pay-link open: 429 before the database or Stripe", async () => {
    const res = await payLinkOpen(
      new Request("https://vamostaxi.site/api/checkout/pay-link/open", {
        method: "POST",
        headers: { ...IP, "content-type": "application/json" },
        body: JSON.stringify({ token: TOKEN }),
      }),
    );
    expect(res.status).toBe(429);
    expect(state.keys).toEqual(["read:paylink:203.0.113.7"]);
    expect(state.db).toBe(0);
  });

  it("published reviews: 429, private (the 5-minute public cache is only for the list itself)", async () => {
    const res = await reviewsGet(new Request("https://vamostaxi.site/api/reviews", { headers: IP }));
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(state.keys).toEqual(["read:reviews:203.0.113.7"]);
    expect(state.db).toBe(0);
  });

  it("wrangler.jsonc declares READ_RATE_LIMITER on namespace 1012 in both environments", () => {
    const wr = readFileSync(join(webRoot, "wrangler.jsonc"), "utf8");
    const decl = /"name": "READ_RATE_LIMITER",\s*"namespace_id": "1012",\s*"simple": \{ "limit": 120, "period": 60 \}/g;
    expect(wr.match(decl)?.length).toBe(2);
    expect(wr.match(/"namespace_id": "1012"/g)?.length).toBe(2);
  });

  it("lock-expire spends its own read key (S8 + S12)", () => {
    const route = readFileSync(join(webRoot, "app/api/checkout/lock-expire/route.ts"), "utf8");
    expect(route).toMatch(/readAllowed\(env\.READ_RATE_LIMITER, "lockexpire", request\)/);
  });
});
