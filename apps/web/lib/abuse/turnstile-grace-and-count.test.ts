// Quick 261003 review 4 and 5.
//  4. A passed challenge gives the visitor 10 minutes without a new challenge (KV pass mark).
//  5. The attempt count lives on a rate-limit binding, so a quote costs no KV write
//     (Workers Free: 1,000 KV writes a day for the whole account).
import { describe, expect, it, vi } from "vitest";
import { wireQuoteAbuse } from "./guards";
import { kvAttemptStore, rateLimitAttemptStore, TURNSTILE_PASS_TTL_SECONDS } from "./turnstile";

const IP = "203.0.113.30";
const QS = "test-vamos-qs-secret-not-a-real-credential-03";

class SpyKV {
  readonly store = new Map<string, string>();
  readonly puts: Array<{ key: string; ttl?: number }> = [];
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string, opts?: { expirationTtl?: number }) {
    this.puts.push({ key, ttl: opts?.expirationTtl });
    this.store.set(key, value);
  }
}

/** Fixed-window fake of a Workers rate-limit binding. */
class Limiter implements RateLimit {
  readonly calls = new Map<string, number>();
  constructor(readonly max: number) {}
  async limit({ key }: { key: string }) {
    const n = (this.calls.get(key) ?? 0) + 1;
    this.calls.set(key, n);
    return { success: n <= this.max };
  }
}

function env(kv: SpyKV, extra: Record<string, unknown> = {}): CloudflareEnv {
  return { VAMOS_QS_SECRET: QS, QUOTE_ABUSE: kv, TURNSTILE_SECRET_KEY: "shared", ...extra } as unknown as CloudflareEnv;
}
const req = (ip = IP) => new Request("https://vamostaxi.site/api/quote", { method: "POST", headers: { "cf-connecting-ip": ip } });
const verifyAs = (success: boolean) =>
  vi.fn(async () => new Response(JSON.stringify({ success }), { status: 200 }));
const run = async (e: CloudflareEnv, body: unknown = {}, ip = IP) => (await wireQuoteAbuse(e, req(ip), "quote", { body })).turnstile();
const REQUIRED = { ok: false, code: "turnstile_required" };

describe("rateLimitAttemptStore (review 5)", () => {
  it("answers 1, 1, then 3 from the 3rd call: the same ladder as the KV counter", async () => {
    const store = rateLimitAttemptStore(new Limiter(2), kvAttemptStore(undefined));
    expect([await store.increment("k"), await store.increment("k"), await store.increment("k"), await store.increment("k")]).toEqual([1, 1, 3, 3]);
  });
  it("a throwing binding never climbs (fails open)", async () => {
    const store = rateLimitAttemptStore({ limit: async () => { throw new Error("down"); } } as unknown as RateLimit, kvAttemptStore(undefined));
    expect(await store.increment("k")).toBe(1);
  });
  it("no binding: the KV counter is used", async () => {
    const kv = new SpyKV();
    const store = rateLimitAttemptStore(undefined, kvAttemptStore(kv as unknown as KVNamespace));
    await store.increment("k");
    expect(kv.puts.map((p) => p.key)).toEqual(["quote:turnstile:k"]);
  });
  it("with the binding, quotes write nothing to KV for counting, and the 3rd is still challenged", async () => {
    const kv = new SpyKV();
    const e = env(kv, { TURNSTILE_ATTEMPT_LIMITER: new Limiter(2) });
    expect(await run(e)).toEqual({ ok: true });
    expect(await run(e)).toEqual({ ok: true });
    expect(await run(e)).toEqual(REQUIRED);
    expect(await run(e)).toEqual(REQUIRED);
    expect(kv.puts).toEqual([]);
  });
});

describe("pass mark (review 4)", () => {
  it("after a passed challenge the next prices are not challenged; the mark lives 10 minutes", async () => {
    const kv = new SpyKV();
    const e = env(kv, { TURNSTILE_ATTEMPT_LIMITER: new Limiter(2) });
    vi.stubGlobal("fetch", verifyAs(true));
    try {
      await run(e);
      await run(e);
      expect(await run(e)).toEqual(REQUIRED);
      expect(await run(e, { turnstile_token: "tok-pass" })).toEqual({ ok: true });
      expect(kv.puts).toEqual([{ key: `quote:turnstile-pass:${IP}`, ttl: TURNSTILE_PASS_TTL_SECONDS }]);
      expect(TURNSTILE_PASS_TTL_SECONDS).toBe(600);
      for (let i = 0; i < 4; i++) expect(await run(e)).toEqual({ ok: true });
      // another address got no grace
      expect(await run(e, {}, "198.51.100.7")).toEqual({ ok: true });
      expect(await run(e, {}, "198.51.100.7")).toEqual({ ok: true });
      expect(await run(e, {}, "198.51.100.7")).toEqual(REQUIRED);
      // the mark expired: challenged again
      kv.store.delete(`quote:turnstile-pass:${IP}`);
      expect(await run(e)).toEqual(REQUIRED);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a refused token leaves no mark", async () => {
    const kv = new SpyKV();
    const e = env(kv, { TURNSTILE_ATTEMPT_LIMITER: new Limiter(2) });
    vi.stubGlobal("fetch", verifyAs(false));
    try {
      await run(e);
      await run(e);
      expect(await run(e, { turnstile_token: "tok-fail" })).toEqual(REQUIRED);
      expect(kv.puts).toEqual([]);
      expect(await run(e)).toEqual(REQUIRED);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("below the threshold the pass mark is not even read", async () => {
    const kv = new SpyKV();
    const get = vi.spyOn(kv, "get");
    const e = env(kv, { TURNSTILE_ATTEMPT_LIMITER: new Limiter(2) });
    await run(e);
    await run(e);
    expect(get).not.toHaveBeenCalled();
  });
});
