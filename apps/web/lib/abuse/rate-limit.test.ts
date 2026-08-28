// apps/web/lib/abuse/rate-limit.test.ts
//
// Two buckets, one signature (D-35, D-36). Bindings are in-memory doubles —
// no Cloudflare account, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mintVamosQs } from "./vamos-qs";
import { bucketFor, checkRateLimit } from "./rate-limit";

/** Obviously-fake visitor-cookie secret — not a real credential shape. */
const FAKE_QS_SECRET = "test-vamos-qs-secret-not-a-real-credential-00";
/** Obviously-fake previous secret used only inside a rotation window. */
const FAKE_QS_PREVIOUS = "test-vamos-qs-secret-previous-not-real-00";

const IP = "203.0.113.10";
const VISITOR = "00000000-0000-4000-8000-0000000000aa";

function makeLimiter(behavior: "ok" | "limited" | "throw"): RateLimit {
  return {
    async limit() {
      if (behavior === "throw") {
        throw new Error("ratelimit binding unavailable");
      }
      return { success: behavior === "ok" };
    },
  };
}

function bindings(opts?: { verified?: RateLimit; bare?: RateLimit }) {
  return {
    QUOTE_RATE_LIMITER: opts?.verified ?? makeLimiter("ok"),
    QUOTE_RATE_LIMITER_BARE: opts?.bare ?? makeLimiter("ok"),
  };
}

describe("bucketFor", () => {
  it("verified cookie returns the 8/60 binding and a key with IP plus subject", async () => {
    const token = await mintVamosQs(FAKE_QS_SECRET, VISITOR);
    const b = bindings();
    const bucket = await bucketFor({
      ip: IP,
      cookie: token,
      secret: FAKE_QS_SECRET,
      bindings: b,
    });
    expect(bucket.limiter).toBe(b.QUOTE_RATE_LIMITER);
    expect(bucket.kind).toBe("verified");
    expect(bucket.key).toContain(IP);
    expect(bucket.key).toContain(VISITOR);
  });

  it("no cookie returns the 4/60 binding and an IP-only key", async () => {
    const b = bindings();
    const bucket = await bucketFor({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      bindings: b,
    });
    expect(bucket.limiter).toBe(b.QUOTE_RATE_LIMITER_BARE);
    expect(bucket.kind).toBe("bare");
    expect(bucket.key).toBe(IP);
  });

  it("unsigned cookie uses the same bare IP key as no cookie (D-36 bypass)", async () => {
    const b = bindings();
    const unsigned = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const missing = await bucketFor({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      bindings: b,
    });
    const forged = await bucketFor({
      ip: IP,
      cookie: unsigned,
      secret: FAKE_QS_SECRET,
      bindings: b,
    });
    expect(forged.limiter).toBe(b.QUOTE_RATE_LIMITER_BARE);
    expect(forged.kind).toBe("bare");
    expect(forged.key).toBe(missing.key);
    expect(Buffer.from(forged.key, "utf8").equals(Buffer.from(missing.key, "utf8"))).toBe(
      true,
    );
  });

  it("cookie signed by the previous secret during a rotation window is 8/60", async () => {
    const token = await mintVamosQs(FAKE_QS_PREVIOUS, VISITOR);
    const b = bindings();
    const bucket = await bucketFor({
      ip: IP,
      cookie: token,
      secret: FAKE_QS_SECRET,
      previousSecret: FAKE_QS_PREVIOUS,
      bindings: b,
      nowMs: Date.parse("2026-08-28T12:00:00.000Z"),
    });
    expect(bucket.limiter).toBe(b.QUOTE_RATE_LIMITER);
    expect(bucket.kind).toBe("verified");
    expect(bucket.key).toContain(VISITOR);
  });

  it("cookie whose MAC is one bit wrong returns the 4/60 bucket", async () => {
    const token = await mintVamosQs(FAKE_QS_SECRET, VISITOR);
    const [vid, mac] = token.split(".") as [string, string];
    const flipped = `${vid}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    const b = bindings();
    const bucket = await bucketFor({
      ip: IP,
      cookie: flipped,
      secret: FAKE_QS_SECRET,
      bindings: b,
    });
    expect(bucket.limiter).toBe(b.QUOTE_RATE_LIMITER_BARE);
    expect(bucket.kind).toBe("bare");
    expect(bucket.key).toBe(IP);
  });
});

describe("checkRateLimit", () => {
  it("returns rate_limited when the binding reports success: false", async () => {
    const result = await checkRateLimit({
      limiter: makeLimiter("limited"),
      key: IP,
    });
    expect(result).toEqual({ ok: false, code: "rate_limited" });
  });

  it("returns ok when the binding reports success: true", async () => {
    const result = await checkRateLimit({
      limiter: makeLimiter("ok"),
      key: IP,
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok and logs when the binding throws — Layer 1 remains the gate", async () => {
    const emit = vi.fn();
    const result = await checkRateLimit({
      limiter: makeLimiter("throw"),
      key: IP,
      emit,
    });
    expect(result).toEqual({ ok: true });
    expect(emit).toHaveBeenCalled();
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "rate-limit.ts"),
      "utf8",
    );
    expect(src).toMatch(/Layer 1/);
    expect(src).toMatch(/QUOTE_RATE_LIMITER_BARE/);
  });
});
