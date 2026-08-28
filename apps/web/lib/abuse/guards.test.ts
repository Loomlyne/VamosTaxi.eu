// apps/web/lib/abuse/guards.test.ts
//
// Pipeline guards in step order 2, 3, 4 (D-35). Cheapest refusal first.

import { describe, expect, it, vi } from "vitest";
import { mintVamosQs } from "./vamos-qs";
import { breakerGuard, rateLimitGuard, turnstileGuard } from "./guards";
import type { InjectedGuard } from "../quote/pipeline";

const FAKE_QS_SECRET = "test-vamos-qs-secret-not-a-real-credential-00";
const IP = "203.0.113.10";
const VISITOR = "00000000-0000-4000-8000-0000000000cc";

function makeLimiter(behavior: "ok" | "limited" | "throw"): RateLimit {
  return {
    async limit() {
      if (behavior === "throw") throw new Error("ratelimit binding unavailable");
      return { success: behavior === "ok" };
    },
  };
}

class MemoryKV {
  readonly store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

class MemoryAttempts {
  readonly counts = new Map<string, number>();
  async increment(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }
}

async function runInStepOrder(
  rateLimit: InjectedGuard,
  turnstile: InjectedGuard,
  breaker: InjectedGuard,
) {
  for (const guard of [rateLimit, turnstile, breaker]) {
    const result = await guard();
    if (!result.ok) return result;
  }
  return { ok: true as const };
}

describe("rateLimitGuard", () => {
  it("maps a limited binding to rate_limited", async () => {
    const guard = rateLimitGuard({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      bindings: {
        QUOTE_RATE_LIMITER: makeLimiter("ok"),
        QUOTE_RATE_LIMITER_BARE: makeLimiter("limited"),
      },
    });
    expect(await guard()).toEqual({ ok: false, code: "rate_limited" });
  });

  it("passes when the binding allows the request", async () => {
    const token = await mintVamosQs(FAKE_QS_SECRET, VISITOR);
    const guard = rateLimitGuard({
      ip: IP,
      cookie: token,
      secret: FAKE_QS_SECRET,
      bindings: {
        QUOTE_RATE_LIMITER: makeLimiter("ok"),
        QUOTE_RATE_LIMITER_BARE: makeLimiter("limited"),
      },
    });
    expect(await guard()).toEqual({ ok: true });
  });
});

describe("turnstileGuard", () => {
  it("maps attempt 3 without a token to turnstile_required", async () => {
    const store = new MemoryAttempts();
    const input = {
      ip: IP,
      cookie: null as string | null,
      secret: FAKE_QS_SECRET,
      turnstileSecret: "test-turnstile-secret-not-a-credential",
      attemptStore: store,
      token: null as string | null,
      fetch: vi.fn(),
    };
    expect(await turnstileGuard(input)()).toEqual({ ok: true });
    expect(await turnstileGuard(input)()).toEqual({ ok: true });
    expect(await turnstileGuard(input)()).toEqual({
      ok: false,
      code: "turnstile_required",
    });
  });
});

describe("breakerGuard", () => {
  it("maps an open breaker to temporarily_unavailable", async () => {
    const kv = new MemoryKV();
    kv.store.set("quote:mapbox-budget:2026-08-28", "5");
    const guard = breakerGuard({
      env: {
        QUOTE_ABUSE: kv as unknown as KVNamespace,
        MAPBOX_DAILY_UNIT_SENTINEL: "5",
      },
      nowMs: Date.parse("2026-08-28T12:00:00.000Z"),
    });
    expect(await guard()).toEqual({ ok: false, code: "temporarily_unavailable" });
  });

  it("passes when the counter is below the sentinel", async () => {
    const kv = new MemoryKV();
    const guard = breakerGuard({
      env: {
        QUOTE_ABUSE: kv as unknown as KVNamespace,
        MAPBOX_DAILY_UNIT_SENTINEL: "5",
      },
      nowMs: Date.parse("2026-08-28T12:00:00.000Z"),
    });
    expect(await guard()).toEqual({ ok: true });
  });
});

describe("composed short-circuit", () => {
  it("short-circuit reports rate_limited when all three would refuse — cheapest first", async () => {
    const kv = new MemoryKV();
    kv.store.set("quote:mapbox-budget:2026-08-28", "9");
    const store = new MemoryAttempts();
    await store.increment(IP);
    await store.increment(IP);
    const result = await runInStepOrder(
      rateLimitGuard({
        ip: IP,
        cookie: null,
        secret: FAKE_QS_SECRET,
        bindings: {
          QUOTE_RATE_LIMITER: makeLimiter("ok"),
          QUOTE_RATE_LIMITER_BARE: makeLimiter("limited"),
        },
      }),
      turnstileGuard({
        ip: IP,
        cookie: null,
        secret: FAKE_QS_SECRET,
        turnstileSecret: "test-turnstile-secret-not-a-credential",
        attemptStore: store,
        token: null,
        fetch: vi.fn(),
      }),
      breakerGuard({
        env: {
          QUOTE_ABUSE: kv as unknown as KVNamespace,
          MAPBOX_DAILY_UNIT_SENTINEL: "5",
        },
        nowMs: Date.parse("2026-08-28T12:00:00.000Z"),
      }),
    );
    expect(result).toEqual({ ok: false, code: "rate_limited" });
  });
});
