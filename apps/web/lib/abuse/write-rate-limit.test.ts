// apps/web/lib/abuse/write-rate-limit.test.ts
//
// Wave 0 (10-01): D-11 / D-13 write limiter. checkWriteRateLimit lands in 10-02.
// Quote checkRateLimit stays fail-open. No new namespace_id. No sk_live_. No invented CHF.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

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

function readLimiter(): string {
  return readFileSync(join(here, "rate-limit.ts"), "utf8");
}

describe("checkRateLimit fail-open (unchanged)", () => {
  it("returns ok true when the binding throws — Layer 1 remains the gate", async () => {
    const result = await checkRateLimit({
      limiter: makeLimiter("throw"),
      key: "203.0.113.10",
    });
    expect(result).toEqual({ ok: true });
    const src = readLimiter();
    const start = src.indexOf("export async function checkRateLimit");
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf("export async function checkWriteRateLimit"));
    const catchAt = fn.indexOf("catch");
    expect(catchAt).toBeGreaterThan(-1);
    expect(fn.slice(catchAt)).toMatch(/ok:\s*true/);
    expect(fn.slice(catchAt)).not.toMatch(/ok:\s*false/);
  });
});

describe("checkWriteRateLimit fail-closed (D-11, D-13)", () => {
  it("exports checkWriteRateLimit on the existing QUOTE_RATE_LIMITER family", () => {
    const src = readLimiter();
    expect(src).toMatch(/export async function checkWriteRateLimit/);
    expect(src).toMatch(/QUOTE_RATE_LIMITER/);
    expect(src).not.toMatch(/namespace_id/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("on throw returns { ok: false, code: \"rate_limited\" }", () => {
    const src = readLimiter();
    const start = src.indexOf("export async function checkWriteRateLimit");
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start);
    const catchAt = fn.indexOf("catch");
    expect(catchAt).toBeGreaterThan(-1);
    expect(fn.slice(catchAt)).toMatch(/ok:\s*false/);
    expect(fn.slice(catchAt)).toMatch(/rate_limited/);
    expect(fn.slice(catchAt)).not.toMatch(/ok:\s*true/);
  });

  it("prefixes keys consent: contact: review: — no new binding", () => {
    const src = readLimiter();
    expect(src).toMatch(/consent:/);
    expect(src).toMatch(/contact:/);
    expect(src).toMatch(/review:/);
  });
});

describe("contact and review write limiter (D-13, D-16)", () => {
  it("formFailure accepts rate_limited with status 429", () => {
    const src = readRepo("apps/web/lib/forms/notify.ts");
    expect(src).toMatch(/FormFailureCode[\s\S]*rate_limited/);
    expect(src).toMatch(/status:\s*400\s*\|\s*403\s*\|\s*503\s*\|\s*429/);
  });

  it("POST /api/contact rate-limits kind contact before write and returns 429 rate_limited", () => {
    const src = readRepo("apps/web/app/api/contact/route.ts");
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post).toMatch(/checkWriteRateLimit/);
    expect(post).toMatch(/kind:\s*["']contact["']/);
    expect(post).toMatch(/QUOTE_RATE_LIMITER/);
    expect(post).toMatch(/formFailure\(["']rate_limited["'],\s*429\)/);
    const limitAt = post.indexOf("checkWriteRateLimit");
    const writeAt = post.indexOf("submit_contact_message");
    expect(limitAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(limitAt);
    expect(src).toMatch(/verifyTurnstile/);
    expect(src).toMatch(/action:\s*["']contact["']/);
    expect(src).not.toMatch(/from ["']@vamos\/db["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/abuse\/turnstile["']/);
    if (src.search(/export (async )?function GET/) >= 0) {
      const getAt = src.search(/export (async )?function GET/);
      const postAt = src.indexOf("export async function POST");
      const getSrc = src.slice(getAt, postAt > getAt ? postAt : undefined);
      expect(getSrc).not.toMatch(/checkWriteRateLimit/);
    }
  });

  it("POST /api/reviews/submit rate-limits kind review before write and returns 429 rate_limited", () => {
    const src = readRepo("apps/web/app/api/reviews/submit/route.ts");
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post).toMatch(/checkWriteRateLimit/);
    expect(post).toMatch(/kind:\s*["']review["']/);
    expect(post).toMatch(/QUOTE_RATE_LIMITER/);
    expect(post).toMatch(/jsonErr\(["']rate_limited["'],\s*429\)/);
    const limitAt = post.indexOf("checkWriteRateLimit");
    const writeAt = post.indexOf("submit_review");
    expect(limitAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(limitAt);
    expect(post).toMatch(/verifyTurnstile/);
    expect(post).toMatch(/action:\s*["']contact["']/);
    expect(src).not.toMatch(/from ["']@vamos\/db["']/);
    expect(src).not.toMatch(/from ["']@\/lib\/abuse\/turnstile["']/);
  });
});
