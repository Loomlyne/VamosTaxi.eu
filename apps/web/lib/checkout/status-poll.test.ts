import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";
import {
  POLL_BACKOFF_DEFAULT_MS,
  POLL_BACKOFF_JITTER_MS,
  POLL_BACKOFF_MAX_MS,
  POLL_INTERVAL_MS,
  backoffAfterRateLimit,
  nextPollDelayMs,
} from "./status-poll";

// 261005 review follow-up (S12): the confirmation poll must not exhaust READ_RATE_LIMITER (120 a minute per
// address) for customers sharing one address, and must honour a 429 instead of reading it as "nothing new".

describe("status poll cadence and 429 back-off (S12)", () => {
  it("polls every 2 seconds: 30 a minute per open tab, a quarter of the limiter's budget", () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(60_000 / POLL_INTERVAL_MS).toBe(30);
  });

  it("a normal answer keeps the normal interval, whatever the header says", () => {
    expect(nextPollDelayMs(200, null, 0.5)).toBe(POLL_INTERVAL_MS);
    expect(nextPollDelayMs(200, "60", 0.5)).toBe(POLL_INTERVAL_MS);
    expect(nextPollDelayMs(500, "60", 0.5)).toBe(POLL_INTERVAL_MS);
  });

  it("a 429 waits for Retry-After (the route sends 60), plus a spread under 2 s", () => {
    expect(nextPollDelayMs(429, "60", 0)).toBe(60_000);
    expect(nextPollDelayMs(429, "30", 0)).toBe(30_000);
    expect(nextPollDelayMs(429, "30", 0.5)).toBe(30_000 + POLL_BACKOFF_JITTER_MS / 2);
    expect(nextPollDelayMs(429, "30", 1)).toBe(30_000 + POLL_BACKOFF_JITTER_MS);
    // Out-of-range randomness never shortens or lengthens the spread.
    expect(nextPollDelayMs(429, "30", -3)).toBe(30_000);
    expect(nextPollDelayMs(429, "30", 9)).toBe(30_000 + POLL_BACKOFF_JITTER_MS);
  });

  it("Retry-After is clamped: never faster than one interval, never longer than the limiter window", () => {
    expect(backoffAfterRateLimit("0")).toBe(POLL_INTERVAL_MS);
    expect(backoffAfterRateLimit("1")).toBe(POLL_INTERVAL_MS);
    expect(backoffAfterRateLimit("5")).toBe(5000);
    expect(backoffAfterRateLimit("3600")).toBe(POLL_BACKOFF_MAX_MS);
    expect(backoffAfterRateLimit("99999")).toBe(POLL_BACKOFF_MAX_MS);
  });

  it("a missing or unreadable Retry-After falls back to the default wait, not to hammering", () => {
    for (const value of [null, undefined, "", "  ", "soon", "-5", "1.5", "Wed, 21 Oct 2026 07:28:00 GMT", "123456"]) {
      expect(backoffAfterRateLimit(value)).toBe(POLL_BACKOFF_DEFAULT_MS);
    }
    expect(POLL_BACKOFF_DEFAULT_MS).toBeGreaterThan(POLL_INTERVAL_MS);
    expect(nextPollDelayMs(429, null, 0)).toBe(POLL_BACKOFF_DEFAULT_MS);
  });

  it("the confirmation client uses them: a 429 sets a floor that a hidden-then-shown tab also respects", () => {
    const client = readFileSync(join(WEB_ROOT, "app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"), "utf8");
    expect(client).toContain('from "@/lib/checkout/status-poll"');
    expect(client).not.toMatch(/POLL_INTERVAL_MS\s*=\s*1000/);
    expect(client).toContain('nextPollDelayMs(res.status, res.headers.get("retry-after"), Math.random())');
    expect(client).toContain("res.status === 429");
    expect(client).toContain("notBefore = Date.now() + delay");
    expect(client).toContain("window.setTimeout(tick, delay)");
    expect(client).toContain("Math.max(POLL_INTERVAL_MS, notBefore - Date.now())");
    // A 429 body is not parsed as a status answer.
    const afterRateLimit = client.slice(client.indexOf("res.status === 429"));
    expect(afterRateLimit.indexOf("pollStatus(await res.json())")).toBeGreaterThan(afterRateLimit.indexOf("} else {"));
  });
});
