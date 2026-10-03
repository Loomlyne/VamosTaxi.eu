// apps/web/lib/abuse/rate-counters.test.ts
//
// Quick 261003: lookups, quotes and reprices spend three different Worker rate-limit
// counters. On live (2026-10-03) address typing on home spent the 4/60 the first
// /checkout quote needed, because geo, flight and quote shared one namespace + key.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { counterBindings, wireQuoteAbuse, wireRateLimitGuard } from "./guards";
import { limiterIp } from "./rate-limit";
import { mintVamosQs } from "./vamos-qs";

const FAKE_QS_SECRET = "test-vamos-qs-secret-not-a-real-credential-00";
const IP = "203.0.113.10";
const VISITOR = "00000000-0000-4000-8000-0000000000dd";
const WEB = join(__dirname, "..", "..");

/** Fixed-window fake: `limit` calls per key, then refuse. Counts every call. */
class CountingLimiter implements RateLimit {
  readonly calls = new Map<string, number>();
  constructor(readonly max: number) {}
  get total(): number {
    let n = 0;
    for (const v of this.calls.values()) n += v;
    return n;
  }
  async limit({ key }: { key: string }) {
    const next = (this.calls.get(key) ?? 0) + 1;
    this.calls.set(key, next);
    return { success: next <= this.max };
  }
}

class MemoryKV {
  readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
}

/** The six bindings with the wrangler.jsonc numbers. */
function makeEnv() {
  const limiters = {
    QUOTE_RATE_LIMITER: new CountingLimiter(8),
    QUOTE_RATE_LIMITER_BARE: new CountingLimiter(4),
    PRICE_RATE_LIMITER: new CountingLimiter(12),
    PRICE_RATE_LIMITER_BARE: new CountingLimiter(8),
    FLIGHT_RATE_LIMITER: new CountingLimiter(10),
    FLIGHT_RATE_LIMITER_BARE: new CountingLimiter(6),
    LOOKUP_RATE_LIMITER: new CountingLimiter(60),
    LOOKUP_RATE_LIMITER_BARE: new CountingLimiter(30),
  };
  const env = {
    ...limiters,
    VAMOS_QS_SECRET: FAKE_QS_SECRET,
    QUOTE_ABUSE: new MemoryKV() as unknown as KVNamespace,
  } as unknown as CloudflareEnv;
  return { env, limiters };
}

function req(cookie?: string): Request {
  const headers = new Headers({ "cf-connecting-ip": IP });
  if (cookie) headers.set("cookie", `vamos_qs=${cookie}`);
  return new Request("https://vamostaxi.site/api/x", { headers });
}

describe("rate counters are separate (quick 261003)", () => {
  it("bare visitor: 30 lookups, then the first quote still passes and the quote counter saw only it", async () => {
    const { env, limiters } = makeEnv();
    for (let i = 0; i < 30; i++) {
      expect(await wireRateLimitGuard(env, req())()).toEqual({ ok: true });
    }
    const quote = await wireQuoteAbuse(env, req());
    expect(await quote.rateLimit()).toEqual({ ok: true });
    expect(limiters.LOOKUP_RATE_LIMITER_BARE.total).toBe(30);
    expect(limiters.QUOTE_RATE_LIMITER_BARE.total).toBe(1);
    expect(limiters.QUOTE_RATE_LIMITER.total).toBe(0);
    expect(limiters.PRICE_RATE_LIMITER_BARE.total).toBe(0);
  });

  it("verified visitor: 60 lookups never touch the quote or price counters", async () => {
    const { env, limiters } = makeEnv();
    const cookie = await mintVamosQs(FAKE_QS_SECRET, VISITOR);
    for (let i = 0; i < 60; i++) {
      expect(await wireRateLimitGuard(env, req(cookie))()).toEqual({ ok: true });
    }
    expect(limiters.LOOKUP_RATE_LIMITER.calls.get(`${IP}:${VISITOR}`)).toBe(60);
    const quote = await wireQuoteAbuse(env, req(cookie));
    expect(await quote.rateLimit()).toEqual({ ok: true });
    expect(limiters.QUOTE_RATE_LIMITER.calls.get(`${IP}:${VISITOR}`)).toBe(1);
    expect(limiters.QUOTE_RATE_LIMITER_BARE.total).toBe(0);
    expect(limiters.LOOKUP_RATE_LIMITER_BARE.total).toBe(0);
  });

  it("reprice / voucher price spend the price counter, not the quote counter", async () => {
    const { env, limiters } = makeEnv();
    for (let i = 0; i < 8; i++) {
      const price = await wireQuoteAbuse(env, req(), "price");
      expect(await price.rateLimit()).toEqual({ ok: true });
    }
    expect(limiters.PRICE_RATE_LIMITER_BARE.total).toBe(8);
    expect(limiters.QUOTE_RATE_LIMITER_BARE.total).toBe(0);
    const quote = await wireQuoteAbuse(env, req());
    expect(await quote.rateLimit()).toEqual({ ok: true });
  });

  it("one normal booking fits every counter: home lookups, checkout load, voucher, flight edit", async () => {
    const { env } = makeEnv();
    const results: boolean[] = [];
    // home: ~20 suggest keystrokes ("ZRH" + "Zurich Main Station"), 2 retrieves, 1 reverse
    for (let i = 0; i < 23; i++) results.push((await wireRateLimitGuard(env, req())()).ok);
    // checkout: retrieve, quote, voucher reprice + its price check, flight reprice, one trip edit
    results.push((await wireRateLimitGuard(env, req())()).ok);
    results.push((await (await wireQuoteAbuse(env, req())).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req())).rateLimit()).ok);
    expect(results.every(Boolean)).toBe(true);
  });

  it("abuse protection kept: the 5th bare quote, the 9th bare price and the 31st bare lookup are refused", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < 4; i++) expect((await (await wireQuoteAbuse(env, req())).rateLimit()).ok).toBe(true);
    expect(await (await wireQuoteAbuse(env, req())).rateLimit()).toEqual({ ok: false, code: "rate_limited" });
    for (let i = 0; i < 8; i++) expect((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok).toBe(true);
    expect(await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).toEqual({ ok: false, code: "rate_limited" });
    for (let i = 0; i < 30; i++) expect((await wireRateLimitGuard(env, req())()).ok).toBe(true);
    expect(await wireRateLimitGuard(env, req())()).toEqual({ ok: false, code: "rate_limited" });
  });

  it("counterBindings maps each counter to its own pair", () => {
    const { env, limiters } = makeEnv();
    expect(counterBindings(env, "quote").QUOTE_RATE_LIMITER).toBe(limiters.QUOTE_RATE_LIMITER);
    expect(counterBindings(env, "quote").QUOTE_RATE_LIMITER_BARE).toBe(limiters.QUOTE_RATE_LIMITER_BARE);
    expect(counterBindings(env, "price").QUOTE_RATE_LIMITER).toBe(limiters.PRICE_RATE_LIMITER);
    expect(counterBindings(env, "price").QUOTE_RATE_LIMITER_BARE).toBe(limiters.PRICE_RATE_LIMITER_BARE);
    expect(counterBindings(env, "lookup").QUOTE_RATE_LIMITER).toBe(limiters.LOOKUP_RATE_LIMITER);
    expect(counterBindings(env, "lookup").QUOTE_RATE_LIMITER_BARE).toBe(limiters.LOOKUP_RATE_LIMITER_BARE);
    expect(counterBindings(env, "flight").QUOTE_RATE_LIMITER).toBe(limiters.FLIGHT_RATE_LIMITER);
    expect(counterBindings(env, "flight").QUOTE_RATE_LIMITER_BARE).toBe(limiters.FLIGHT_RATE_LIMITER_BARE);
  });

  it("flight lookups spend their own small counter: 6 bare, then refused, while geo lookups still pass", async () => {
    const { env, limiters } = makeEnv();
    for (let i = 0; i < 6; i++) expect((await wireRateLimitGuard(env, req(), "flight")()).ok).toBe(true);
    expect(await wireRateLimitGuard(env, req(), "flight")()).toEqual({ ok: false, code: "rate_limited" });
    expect(limiters.LOOKUP_RATE_LIMITER_BARE.total).toBe(0);
    expect((await wireRateLimitGuard(env, req())()).ok).toBe(true);
    expect((await (await wireQuoteAbuse(env, req())).rateLimit()).ok).toBe(true);
    expect(limiters.FLIGHT_RATE_LIMITER_BARE.total).toBe(7);
  });
});

describe("routes and wrangler.jsonc agree (quick 261003)", () => {
  const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

  it("geo routes use the lookup counter, flight its own; quote uses quote; reprice and price use price", () => {
    for (const rel of [
      "app/api/geo/suggest/route.ts",
      "app/api/geo/retrieve/route.ts",
      "app/api/geo/reverse/route.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/wireRateLimitGuard\(env, request\)/);
      expect(src, rel).not.toMatch(/wireQuoteAbuse/);
    }
    const flight = read("app/api/flight/[no]/route.ts");
    expect(flight).toMatch(/wireRateLimitGuard\(env, request, "flight"\)/);
    expect(flight).not.toMatch(/wireQuoteAbuse/);
    expect(read("app/api/quote/route.ts")).toMatch(/wireQuoteAbuse\(env, request\)/);
    expect(read("app/api/quote/reprice/route.ts")).toMatch(/wireQuoteAbuse\(env, request, "price"\)/);
    expect(read("app/api/checkout/price/route.ts")).toMatch(/wireQuoteAbuse\(env, request, "price"\)/);
  });

  it("both env blocks declare the new bindings with unique namespaces and leave 1001/1002 at 8 and 4", () => {
    const wr = read("wrangler.jsonc");
    const expected: Array<[string, string, number]> = [
      ["QUOTE_RATE_LIMITER", "1001", 8],
      ["QUOTE_RATE_LIMITER_BARE", "1002", 4],
      ["LOOKUP_RATE_LIMITER", "1005", 60],
      ["LOOKUP_RATE_LIMITER_BARE", "1006", 30],
      ["PRICE_RATE_LIMITER", "1007", 12],
      ["PRICE_RATE_LIMITER_BARE", "1008", 8],
      ["FLIGHT_RATE_LIMITER", "1009", 10],
      ["FLIGHT_RATE_LIMITER_BARE", "1010", 6],
    ];
    for (const [name, ns, limit] of expected) {
      const re = new RegExp(
        `"name": "${name}",\\s*"namespace_id": "${ns}",\\s*"simple": \\{ "limit": ${limit}, "period": 60 \\}`,
        "g",
      );
      expect(wr.match(re), name).toHaveLength(2);
    }
    const blocks = wr.split('"ratelimits": [').slice(1).map((b) => b.slice(0, b.indexOf("]")));
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      const ids = [...block.matchAll(/"namespace_id": "(\d+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("limiterIp: IPv6 keyed by /64 (quick 261003 review)", () => {
  it("leaves IPv4 and non-addresses unchanged", () => {
    expect(limiterIp("203.0.113.10")).toBe("203.0.113.10");
    expect(limiterIp("unknown")).toBe("unknown");
    expect(limiterIp("::ffff:203.0.113.10")).toBe("::ffff:203.0.113.10");
    expect(limiterIp("2001:db8::1::2")).toBe("2001:db8::1::2");
    expect(limiterIp("2001:db8:zz::1")).toBe("2001:db8:zz::1");
    expect(limiterIp("1:2:3:4:5:6:7:8:9")).toBe("1:2:3:4:5:6:7:8:9");
  });

  it("cuts IPv6 to its /64 in one canonical form", () => {
    expect(limiterIp("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(limiterIp("2001:db8:1:2::9")).toBe("2001:db8:1:2::/64");
    expect(limiterIp("2001:DB8:1:2:ffff::")).toBe("2001:db8:1:2::/64");
    expect(limiterIp("2001:db8::")).toBe("2001:db8:0:0::/64");
    expect(limiterIp("fe80::1%en0")).toBe("fe80:0:0:0::/64");
  });

  it("two addresses in one /64 share one bucket; another /64 gets its own", async () => {
    const { env, limiters } = makeEnv();
    const from = (ip: string) =>
      new Request("https://vamostaxi.site/api/x", { headers: { "cf-connecting-ip": ip } });
    for (let i = 0; i < 30; i++) {
      const ip = `2001:db8:1:2::${(i + 1).toString(16)}`;
      expect((await wireRateLimitGuard(env, from(ip))()).ok).toBe(true);
    }
    expect(await wireRateLimitGuard(env, from("2001:db8:1:2:ffff::1"))()).toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect((await wireRateLimitGuard(env, from("2001:db8:1:3::1"))()).ok).toBe(true);
    expect([...limiters.LOOKUP_RATE_LIMITER_BARE.calls.keys()].sort()).toEqual([
      "2001:db8:1:2::/64",
      "2001:db8:1:3::/64",
    ]);
  });
});
