// apps/web/lib/abuse/rate-counters.test.ts
//
// Quick 261003: lookups, quotes and reprices spend three different Worker rate-limit
// counters. On live (2026-10-03) address typing on home spent the 4/60 the first
// /checkout quote needed, because geo, flight and quote shared one namespace + key.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { counterBindings, wireQuoteAbuse, wireRateLimitGuard } from "./guards";
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
    LOOKUP_RATE_LIMITER: new CountingLimiter(60),
    LOOKUP_RATE_LIMITER_BARE: new CountingLimiter(40),
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
  it("bare visitor: 40 lookups, then the first quote still passes and the quote counter saw only it", async () => {
    const { env, limiters } = makeEnv();
    for (let i = 0; i < 40; i++) {
      expect(await wireRateLimitGuard(env, req())()).toEqual({ ok: true });
    }
    const quote = await wireQuoteAbuse(env, req());
    expect(await quote.rateLimit()).toEqual({ ok: true });
    expect(limiters.LOOKUP_RATE_LIMITER_BARE.total).toBe(40);
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
    // home: ~25 suggest keystrokes, 2 retrieves, 1 reverse, 2 flight lookups
    for (let i = 0; i < 30; i++) results.push((await wireRateLimitGuard(env, req())()).ok);
    // checkout: retrieve, quote, voucher reprice + its price check, flight reprice, one trip edit
    results.push((await wireRateLimitGuard(env, req())()).ok);
    results.push((await (await wireQuoteAbuse(env, req())).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok);
    results.push((await (await wireQuoteAbuse(env, req())).rateLimit()).ok);
    expect(results.every(Boolean)).toBe(true);
  });

  it("abuse protection kept: the 5th bare quote, the 9th bare price and the 41st bare lookup are refused", async () => {
    const { env } = makeEnv();
    for (let i = 0; i < 4; i++) expect((await (await wireQuoteAbuse(env, req())).rateLimit()).ok).toBe(true);
    expect(await (await wireQuoteAbuse(env, req())).rateLimit()).toEqual({ ok: false, code: "rate_limited" });
    for (let i = 0; i < 8; i++) expect((await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).ok).toBe(true);
    expect(await (await wireQuoteAbuse(env, req(), "price")).rateLimit()).toEqual({ ok: false, code: "rate_limited" });
    for (let i = 0; i < 40; i++) expect((await wireRateLimitGuard(env, req())()).ok).toBe(true);
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
  });
});

describe("routes and wrangler.jsonc agree (quick 261003)", () => {
  const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

  it("geo and flight routes use the lookup guard; quote uses the quote counter; reprice and price use price", () => {
    for (const rel of [
      "app/api/geo/suggest/route.ts",
      "app/api/geo/retrieve/route.ts",
      "app/api/geo/reverse/route.ts",
      "app/api/flight/[no]/route.ts",
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/wireRateLimitGuard\(env, request\)/);
      expect(src, rel).not.toMatch(/wireQuoteAbuse/);
    }
    expect(read("app/api/quote/route.ts")).toMatch(/wireQuoteAbuse\(env, request\)/);
    expect(read("app/api/quote/reprice/route.ts")).toMatch(/wireQuoteAbuse\(env, request, "price"\)/);
    expect(read("app/api/checkout/price/route.ts")).toMatch(/wireQuoteAbuse\(env, request, "price"\)/);
  });

  it("/checkout retries a rate_limited price once by itself, after the 60 s window", () => {
    const src = read("app/[locale]/checkout/CheckoutPage.tsx");
    expect(src).toMatch(/phase\.refusal\.code !== "rate_limited" \|\| autoRetried\.current/);
    expect(src).toMatch(/if \(seq\.current !== mine\) return;\s*autoRetried\.current = true;/);
    expect(src).toMatch(/\}, 61_000\);/);
    expect(src).toMatch(/return \(\) => window\.clearTimeout\(id\);\s*\}, \[phase\]\);/);
  });

  it("both env blocks declare the new bindings with unique namespaces and leave 1001/1002 at 8 and 4", () => {
    const wr = read("wrangler.jsonc");
    const expected: Array<[string, string, number]> = [
      ["QUOTE_RATE_LIMITER", "1001", 8],
      ["QUOTE_RATE_LIMITER_BARE", "1002", 4],
      ["LOOKUP_RATE_LIMITER", "1005", 60],
      ["LOOKUP_RATE_LIMITER_BARE", "1006", 40],
      ["PRICE_RATE_LIMITER", "1007", 12],
      ["PRICE_RATE_LIMITER_BARE", "1008", 8],
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
