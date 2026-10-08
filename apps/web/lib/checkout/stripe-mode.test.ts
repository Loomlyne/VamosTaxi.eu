// apps/web/lib/checkout/stripe-mode.test.ts
//
// J1 (2026-10-09 payments review W1-02, W1-04, W1-15): one reader of Stripe key mode, a webhook
// that refuses an event from the wrong mode, a client factory that refuses a value that is not
// a Stripe key. Key shapes are assembled from parts so no key-prefix literal sits in this file.

import { describe, expect, it, vi } from "vitest";
import {
  requireStripeSecretMode,
  stripeKeyRefused,
  stripeKeysAgree,
  stripePublishableKeyMode,
  stripeSecretKeyMode,
  StripeModeError,
} from "./stripe-mode";
import { stripeFromEnv } from "./stripe";
import { handleStripeWebhook, type WebhookDeps } from "./webhook";
import { WebhookModeError, WebhookVerificationError } from "./webhook-verify";

const SK_LIVE = ["sk", "live", "abc123"].join("_");
const SK_TEST = ["sk", "test", "abc123"].join("_");
const RK_LIVE = ["rk", "live", "abc123"].join("_");
const RK_TEST = ["rk", "test", "abc123"].join("_");
const PK_LIVE = ["pk", "live", "abc123"].join("_");
const PK_TEST = ["pk", "test", "abc123"].join("_");

describe("stripeSecretKeyMode", () => {
  it("reads the mode of secret and restricted keys", () => {
    expect(stripeSecretKeyMode(SK_LIVE)).toBe("live");
    expect(stripeSecretKeyMode(RK_LIVE)).toBe("live");
    expect(stripeSecretKeyMode(SK_TEST)).toBe("test");
    expect(stripeSecretKeyMode(RK_TEST)).toBe("test");
  });

  it("refuses everything else: case, inner spaces, other prefixes, empty; ignores surrounding whitespace", () => {
    for (const bad of [SK_LIVE.toUpperCase(), `${SK_LIVE} x`, PK_LIVE, "whsec_abc", "sk_abc", "", "  ", null, undefined]) {
      expect(stripeSecretKeyMode(bad as string)).toBeNull();
    }
  });
});

describe("surrounding whitespace", () => {
  it("is ignored by the readers and by stripeFromEnv (fetch trims the header value anyway)", () => {
    expect(stripeSecretKeyMode(`${SK_LIVE}\n`)).toBe("live");
    expect(stripeSecretKeyMode(` ${RK_TEST} `)).toBe("test");
    expect(stripePublishableKeyMode(`${PK_LIVE}\n`)).toBe("live");
    expect(() => stripeFromEnv({ STRIPE_SECRET_KEY: `${SK_LIVE}\n` } as unknown as CloudflareEnv)).not.toThrow();
  });
});

describe("stripePublishableKeyMode", () => {
  it("reads live and test, and treats the production placeholder as no mode", () => {
    expect(stripePublishableKeyMode(PK_LIVE)).toBe("live");
    expect(stripePublishableKeyMode(PK_TEST)).toBe("test");
    expect(stripePublishableKeyMode("pk_test_placeholder")).toBeNull();
    expect(stripePublishableKeyMode(SK_LIVE)).toBeNull();
  });
});

describe("stripeKeysAgree", () => {
  it("is true for matching modes and for the placeholder, false for a mix or a bad secret", () => {
    expect(stripeKeysAgree({ STRIPE_SECRET_KEY: SK_LIVE, STRIPE_PUBLISHABLE_KEY: PK_LIVE })).toBe(true);
    expect(stripeKeysAgree({ STRIPE_SECRET_KEY: RK_LIVE, STRIPE_PUBLISHABLE_KEY: PK_LIVE })).toBe(true);
    expect(stripeKeysAgree({ STRIPE_SECRET_KEY: SK_TEST, STRIPE_PUBLISHABLE_KEY: PK_TEST })).toBe(true);
    expect(stripeKeysAgree({ STRIPE_SECRET_KEY: SK_TEST, STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder" })).toBe(true);
    expect(stripeKeysAgree({ STRIPE_SECRET_KEY: SK_LIVE, STRIPE_PUBLISHABLE_KEY: PK_TEST })).toBe(false);
    expect(stripeKeysAgree({ STRIPE_SECRET_KEY: SK_TEST, STRIPE_PUBLISHABLE_KEY: PK_LIVE })).toBe(false);
    expect(stripeKeysAgree({ STRIPE_SECRET_KEY: "nope", STRIPE_PUBLISHABLE_KEY: PK_LIVE })).toBe(false);
    expect(stripeKeysAgree({})).toBe(false);
  });
});

describe("stripeKeyRefused (staff early check)", () => {
  it("refuses a bound value that is not a Stripe key; an unbound key and any real key pass", () => {
    expect(stripeKeyRefused({ STRIPE_SECRET_KEY: "not-a-key" })).toBe(true);
    expect(stripeKeyRefused({})).toBe(false);
    expect(stripeKeyRefused({ STRIPE_SECRET_KEY: SK_LIVE })).toBe(false);
    expect(stripeKeyRefused({ STRIPE_SECRET_KEY: RK_LIVE })).toBe(false);
    expect(stripeKeyRefused({ STRIPE_SECRET_KEY: SK_TEST })).toBe(false);
  });
});

describe("stripeFromEnv", () => {
  it("builds a client for live and test keys and throws StripeModeError for anything else", () => {
    expect(() => stripeFromEnv({ STRIPE_SECRET_KEY: SK_LIVE } as unknown as CloudflareEnv)).not.toThrow();
    expect(() => stripeFromEnv({ STRIPE_SECRET_KEY: RK_LIVE } as unknown as CloudflareEnv)).not.toThrow();
    expect(() => stripeFromEnv({ STRIPE_SECRET_KEY: SK_TEST } as unknown as CloudflareEnv)).not.toThrow();
    expect(() => stripeFromEnv({ STRIPE_SECRET_KEY: `${SK_LIVE} x` } as unknown as CloudflareEnv)).toThrow(StripeModeError);
    expect(() => stripeFromEnv({ STRIPE_SECRET_KEY: "garbage" } as unknown as CloudflareEnv)).toThrow(StripeModeError);
    expect(() => requireStripeSecretMode(undefined)).toThrow(StripeModeError);
  });
});

describe("handleStripeWebhook mode handling", () => {
  function deps(verify: WebhookDeps["verify"]) {
    const emit = vi.fn();
    const record = vi.fn(async () => true);
    const enqueue = vi.fn(async () => undefined);
    return { emit, record, enqueue, deps: { verify, record, enqueue, emit } as WebhookDeps };
  }

  it("answers 400 with an error-level log when the event is from the wrong mode, and records nothing", async () => {
    const d = deps(async () => {
      throw new WebhookModeError("event livemode false does not match the live secret key");
    });
    const res = await handleStripeWebhook("{}", "t=1,v1=x", d.deps);
    expect(res.status).toBe(400);
    expect(d.emit).toHaveBeenCalledWith("error", "stripe_webhook_mode_mismatch", expect.any(Object));
    expect(d.record).not.toHaveBeenCalled();
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("keeps a forged signature at 400 with a warn log", async () => {
    const d = deps(async () => {
      throw new WebhookVerificationError("bad signature");
    });
    const res = await handleStripeWebhook("{}", "t=1,v1=x", d.deps);
    expect(res.status).toBe(400);
    expect(d.emit).toHaveBeenCalledWith("warn", "stripe_webhook", expect.any(Object));
  });

  it("rethrows a misconfiguration (no webhook secret, bad key) so the route answers 500, with an error log", async () => {
    const d = deps(async () => {
      throw new Error("STRIPE_WEBHOOK_SECRET is not bound");
    });
    await expect(handleStripeWebhook("{}", "t=1,v1=x", d.deps)).rejects.toThrow("not bound");
    expect(d.emit).toHaveBeenCalledWith("error", "stripe_webhook_config", expect.any(Object));
  });
});

// R05: the real verifier, not a stub. Signs a payload with Stripe's own test helper and runs it
// through verifyStripeEvent, so inverting the livemode comparison fails here.
describe("verifyStripeEvent livemode check (real signature)", async () => {
  const Stripe = (await import("stripe")).default;
  const { verifyStripeEvent } = await import("./webhook-verify");
  const SECRET = "whsec_test_fixture_sign_only";

  function signed(livemode: boolean) {
    const payload = JSON.stringify({
      id: "evt_mode_1",
      object: "event",
      api_version: "2026-08-26.dahlia",
      created: 1_700_000_000,
      livemode,
      type: "checkout.session.completed",
      data: { object: { id: "cs_mode_1", object: "checkout.session" } },
    });
    return { payload, header: Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) };
  }
  const env = (sk: string) => ({ STRIPE_SECRET_KEY: sk, STRIPE_WEBHOOK_SECRET: SECRET }) as unknown as CloudflareEnv;

  it("accepts a live event with a live key and a test event with a test key", async () => {
    const live = signed(true);
    expect((await verifyStripeEvent(env(SK_LIVE), live.payload, live.header)).id).toBe("evt_mode_1");
    const test = signed(false);
    expect((await verifyStripeEvent(env(SK_TEST), test.payload, test.header)).id).toBe("evt_mode_1");
  });

  it("refuses a test event with a live key and a live event with a test key", async () => {
    const test = signed(false);
    await expect(verifyStripeEvent(env(SK_LIVE), test.payload, test.header)).rejects.toBeInstanceOf(WebhookModeError);
    const live = signed(true);
    await expect(verifyStripeEvent(env(RK_TEST), live.payload, live.header)).rejects.toBeInstanceOf(WebhookModeError);
  });

  it("a missing webhook secret is a plain error (500), not a verification error (400)", async () => {
    const live = signed(true);
    const err = await verifyStripeEvent({ STRIPE_SECRET_KEY: SK_LIVE } as unknown as CloudflareEnv, live.payload, live.header).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WebhookVerificationError);
  });

  it("a bad signature stays a verification error", async () => {
    const live = signed(true);
    await expect(verifyStripeEvent(env(SK_LIVE), live.payload, "t=1,v1=bad")).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});
