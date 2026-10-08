// apps/web/lib/health/probe-mode.test.ts
//
// J1 (W1-04): `payments` is true only when Stripe answers AND the secret key, the publishable key
// and the account Stripe reports all name the same mode. Key shapes are built from parts.

import { describe, expect, it, vi } from "vitest";

let balanceLivemode = true;
vi.mock("@/lib/checkout/stripe", () => ({
  stripeFromEnv: () => ({ balance: { retrieve: async () => ({ livemode: balanceLivemode }) } }),
}));
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (sql: unknown) => unknown) => fn(async () => []),
}));

import { probeHealth } from "./probe";

const SK_LIVE = ["sk", "live", "abc"].join("_");
const SK_TEST = ["sk", "test", "abc"].join("_");
const PK_LIVE = ["pk", "live", "abc"].join("_");
const PK_TEST = ["pk", "test", "abc"].join("_");

function env(secret: string, publishable: string): CloudflareEnv {
  return { STRIPE_SECRET_KEY: secret, STRIPE_PUBLISHABLE_KEY: publishable, MAPBOX_TOKEN: "pk.x" } as unknown as CloudflareEnv;
}

describe("probeHealth payments mode", () => {
  it("is healthy when the keys and the Stripe account are all live", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true }));
    balanceLivemode = true;
    expect((await probeHealth(env(SK_LIVE, PK_LIVE))).payments).toBe(true);
  });

  it("is down when the secret key is live and the publishable key is test", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true }));
    balanceLivemode = true;
    expect((await probeHealth(env(SK_LIVE, PK_TEST))).payments).toBe(false);
  });

  it("is down when Stripe says the account is test but the key says live", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true }));
    balanceLivemode = false;
    expect((await probeHealth(env(SK_LIVE, PK_LIVE))).payments).toBe(false);
  });

  it("is healthy in test mode too (sandbox proof)", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true }));
    balanceLivemode = false;
    expect((await probeHealth(env(SK_TEST, PK_TEST))).payments).toBe(true);
  });
});
