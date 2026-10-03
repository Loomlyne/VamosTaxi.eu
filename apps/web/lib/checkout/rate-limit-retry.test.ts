// apps/web/lib/checkout/rate-limit-retry.test.ts — quick 261003 review: behaviour of the
// one automatic price retry after a rate_limited refusal, on vitest fake timers.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimitAutoRetry, RATE_LIMIT_RETRY_MS } from "./rate-limit-retry";

function harness() {
  let seq = 0;
  const retry = vi.fn();
  const auto = createRateLimitAutoRetry({ currentSeq: () => seq, retry });
  /** Start a quote: the page bumps its request number first. */
  const start = () => ++seq;
  return { auto, retry, start };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("rate_limited auto retry", () => {
  it("retries once, only after the 60 s window", () => {
    const { auto, retry, start } = harness();
    auto.settled("rate_limited", start());
    vi.advanceTimersByTime(60_000);
    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS - 60_000);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("never more than one: a second rate_limited after the auto retry waits for the customer", () => {
    const { auto, retry, start } = harness();
    auto.settled("rate_limited", start());
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS);
    expect(retry).toHaveBeenCalledTimes(1);
    auto.settled("rate_limited", start()); // the auto retry was refused again
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS * 5);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("TRY AGAIN cancels the pending retry and every later one", () => {
    const { auto, retry, start } = harness();
    auto.settled("rate_limited", start());
    vi.advanceTimersByTime(10_000);
    auto.manualRetry();
    auto.settled("rate_limited", start()); // the customer's own retry was refused too
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS * 5);
    expect(retry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmount clears the timer", () => {
    const { auto, retry, start } = harness();
    auto.settled("rate_limited", start());
    expect(vi.getTimerCount()).toBe(1);
    auto.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS * 2);
    expect(retry).not.toHaveBeenCalled();
  });

  it("a trip change (a newer quote) skips the pending retry", () => {
    const { auto, retry, start } = harness();
    auto.settled("rate_limited", start());
    start(); // the customer edited the trip: a newer request is in flight
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS);
    expect(retry).not.toHaveBeenCalled();
  });

  it("a stale result does not arm, and a priced result cancels a pending retry", () => {
    const { auto, retry, start } = harness();
    const old = start();
    start();
    auto.settled("rate_limited", old); // older request settling late
    expect(vi.getTimerCount()).toBe(0);

    const { auto: a2, retry: r2, start: s2 } = harness();
    a2.settled("rate_limited", s2());
    a2.settled(null, s2());
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS);
    expect(r2).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it("other errors never arm a retry", () => {
    const { auto, retry, start } = harness();
    auto.settled("temporarily_unavailable", start());
    auto.settled("turnstile_required", start());
    vi.advanceTimersByTime(RATE_LIMIT_RETRY_MS * 2);
    expect(retry).not.toHaveBeenCalled();
  });
});
