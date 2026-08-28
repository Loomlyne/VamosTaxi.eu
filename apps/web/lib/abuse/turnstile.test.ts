// apps/web/lib/abuse/turnstile.test.ts
//
// Siteverify + log-then-enforce ladder (D-35, D-36, D-47). Injected fetch
// only — no Turnstile secret, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mintVamosQs } from "./vamos-qs";
import { challengeDecision, siteverify } from "./turnstile";

const FAKE_QS_SECRET = "test-vamos-qs-secret-not-a-real-credential-00";
const FAKE_TURNSTILE_SECRET = "test-turnstile-secret-not-a-credential";
const IP = "203.0.113.10";
const VISITOR = "00000000-0000-4000-8000-0000000000bb";
const TOKEN = "turnstile-token-fixture";
const IDEMPOTENCY = "idem-00000000-0000-4000-8000-000000000001";

class MemoryAttempts {
  readonly counts = new Map<string, number>();
  async increment(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  const raw = init?.body;
  if (typeof raw !== "string") return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("siteverify", () => {
  it("unconfigured secret returns configured false without calling fetch (D-47)", async () => {
    const fetchFn = vi.fn();
    const result = await siteverify({
      response: TOKEN,
      idempotencyKey: IDEMPOTENCY,
      fetch: fetchFn,
    });
    expect(result).toEqual({ configured: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("success body returns configured true and success true", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ success: true }));
    const result = await siteverify({
      secret: FAKE_TURNSTILE_SECRET,
      response: TOKEN,
      idempotencyKey: IDEMPOTENCY,
      fetch: fetchFn,
    });
    expect(result).toEqual({ configured: true, success: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("timeout-or-duplicate is a distinct mint-fresh result, not a block", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    );
    const result = await siteverify({
      secret: FAKE_TURNSTILE_SECRET,
      response: TOKEN,
      idempotencyKey: IDEMPOTENCY,
      fetch: fetchFn,
    });
    expect(result).toEqual({
      configured: true,
      success: false,
      timeoutOrDuplicate: true,
    });
    expect("timeoutOrDuplicate" in result).toBe(true);
  });

  it("first-attempt timeout retries exactly once with the same idempotency_key", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchFn = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const result = await siteverify({
      secret: FAKE_TURNSTILE_SECRET,
      response: TOKEN,
      remoteip: IP,
      idempotencyKey: IDEMPOTENCY,
      fetch: fetchFn,
    });
    expect(result).toEqual({ configured: true, success: false, degraded: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const first = parseBody(fetchFn.mock.calls[0]?.[1] as RequestInit);
    const second = parseBody(fetchFn.mock.calls[1]?.[1] as RequestInit);
    expect(first.idempotency_key).toBe(IDEMPOTENCY);
    expect(second.idempotency_key).toBe(IDEMPOTENCY);
    expect(first.idempotency_key).toBe(second.idempotency_key);
    expect(timeoutSpy.mock.calls.some((c) => c[0] === 2_000)).toBe(true);
    timeoutSpy.mockRestore();
  });

  it("second timeout is degraded and does not retry a third time", async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const result = await siteverify({
      secret: FAKE_TURNSTILE_SECRET,
      response: TOKEN,
      idempotencyKey: IDEMPOTENCY,
      fetch: fetchFn,
    });
    expect(result.degraded).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("challengeDecision", () => {
  it("attempt counts 1 and 2 return enforce false regardless of token", async () => {
    const store = new MemoryAttempts();
    const first = await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      token: TOKEN,
      configured: true,
    });
    const second = await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      token: null,
      configured: true,
    });
    expect(first.enforce).toBe(false);
    expect(second.enforce).toBe(false);
  });

  it("attempt 3 with no token returns enforce true", async () => {
    const store = new MemoryAttempts();
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: true,
    });
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: true,
    });
    const third = await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      token: null,
      configured: true,
    });
    expect(third.enforce).toBe(true);
    expect(third.passed).toBe(false);
  });

  it("attempt 3 with a valid token returns enforce true passed true", async () => {
    const store = new MemoryAttempts();
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: true,
    });
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: true,
    });
    const third = await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      token: TOKEN,
      verify: { configured: true, success: true },
      configured: true,
    });
    expect(third.enforce).toBe(true);
    expect(third.passed).toBe(true);
  });

  it("unsigned cookie on attempt 3 does not reset the count (D-36)", async () => {
    const store = new MemoryAttempts();
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: true,
    });
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: true,
    });
    const unsigned = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const third = await challengeDecision({
      ip: IP,
      cookie: unsigned,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      token: null,
      configured: true,
    });
    expect(third.enforce).toBe(true);
    const verified = await mintVamosQs(FAKE_QS_SECRET, VISITOR);
    const other = await challengeDecision({
      ip: IP,
      cookie: verified,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      token: null,
      configured: true,
    });
    expect(other.enforce).toBe(false);
  });

  it("unconfigured or degraded at attempt 3 fails open with fellBackToEdge (D-47)", async () => {
    const store = new MemoryAttempts();
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: false,
    });
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      configured: false,
    });
    const unconfigured = await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store,
      token: null,
      configured: false,
    });
    expect(unconfigured.enforce).toBe(false);
    expect(unconfigured.fellBackToEdge).toBe(true);

    const store2 = new MemoryAttempts();
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store2,
      configured: true,
    });
    await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store2,
      configured: true,
    });
    const degraded = await challengeDecision({
      ip: IP,
      cookie: null,
      secret: FAKE_QS_SECRET,
      attemptStore: store2,
      configured: true,
      degraded: true,
    });
    expect(degraded.enforce).toBe(false);
    expect(degraded.fellBackToEdge).toBe(true);
  });
});

describe("turnstile source rules", () => {
  it("executable source does not call console", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "turnstile.ts"), "utf8");
    const executable = src
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(executable).not.toMatch(/console\./);
  });
});
