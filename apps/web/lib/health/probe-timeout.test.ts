// apps/web/lib/health/probe-timeout.test.ts
//
// 26.2-u02: a dependency that never answers must read as "down", not hang the
// hourly probe (worker.ts runs it before the 06:00 digest in the same cron).

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/checkout/stripe", () => ({
  stripeFromEnv: () => ({ balance: { retrieve: () => new Promise(() => {}) } }),
}));
vi.mock("@/lib/db/identity", () => ({
  asSystem: () => new Promise(() => {}),
}));

import { HEALTH_PROBE_TIMEOUT_MS, probeHealth } from "./probe";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("probeHealth timeout", () => {
  it("answers all-false when db, Stripe and Mapbox never respond", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const env = { MAPBOX_TOKEN: "pk.test" } as unknown as CloudflareEnv;
    const settled = vi.fn();
    const pending = probeHealth(env).then((r) => {
      settled();
      return r;
    });
    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_TIMEOUT_MS + 100);
    expect(settled).toHaveBeenCalled();
    expect(await pending).toEqual({ ok: false, db: false, payments: false, maps: false });
  });
});
