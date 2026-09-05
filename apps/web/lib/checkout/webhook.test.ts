import { describe, expect, it, vi } from "vitest";
import { handleStripeWebhook, type WebhookDeps } from "./webhook";
import { WebhookVerificationError } from "./webhook-verify";
import type Stripe from "stripe";

function event(overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    type: "checkout.session.completed",
    created: 1_725_000_000,
    data: { object: { id: "cs_test_1" } },
    ...overrides,
  } as Stripe.Event;
}

function deps(patch: Partial<WebhookDeps> = {}): WebhookDeps & {
  record: ReturnType<typeof vi.fn>;
  enqueue: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
} {
  const verify = vi.fn(async () => event());
  const record = vi.fn(async () => true);
  const enqueue = vi.fn(async () => undefined);
  return {
    verify,
    record,
    enqueue,
    emit: () => undefined,
    ...patch,
  } as WebhookDeps & {
    record: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
  };
}

describe("handleStripeWebhook", () => {
  it("returns 400 with no stripe-signature and records nothing", async () => {
    const d = deps({
      verify: vi.fn(async () => {
        throw new WebhookVerificationError("missing stripe-signature");
      }),
    });
    const res = await handleStripeWebhook("{}", null, d);
    expect(res.status).toBe(400);
    expect(d.record).not.toHaveBeenCalled();
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("returns 400 on a forged signature and never records or enqueues", async () => {
    const d = deps({
      verify: vi.fn(async () => {
        throw new WebhookVerificationError("bad signature");
      }),
    });
    const res = await handleStripeWebhook("{}", "t=1,v1=forged", d);
    expect(res.status).toBe(400);
    expect(d.record).not.toHaveBeenCalled();
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("returns 200 with an empty body for a valid signed event", async () => {
    const d = deps();
    const res = await handleStripeWebhook("{}", "t=1,v1=abc", d);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(d.enqueue).toHaveBeenCalledWith({
      eventId: "evt_1",
      type: "checkout.session.completed",
      objectId: "cs_test_1",
      stripeCreated: 1_725_000_000,
    });
  });

  it("still returns 200 and enqueues when the record RPC reports a duplicate", async () => {
    const d = deps({ record: vi.fn(async () => false) });
    const res = await handleStripeWebhook("{}", "t=1,v1=abc", d);
    expect(res.status).toBe(200);
    expect(d.enqueue).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when record throws so Stripe retries", async () => {
    const d = deps({
      record: vi.fn(async () => {
        throw new Error("db");
      }),
    });
    const res = await handleStripeWebhook("{}", "t=1,v1=abc", d);
    expect(res.status).toBe(500);
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("returns 500 when enqueue throws after a successful record", async () => {
    const d = deps({
      enqueue: vi.fn(async () => {
        throw new Error("queue");
      }),
    });
    const res = await handleStripeWebhook("{}", "t=1,v1=abc", d);
    expect(res.status).toBe(500);
  });

  it("passes the raw string to verify, never a parsed object", async () => {
    const d = deps();
    const raw = '{"id":"evt"}';
    await handleStripeWebhook(raw, "t=1,v1=abc", d);
    expect(d.verify).toHaveBeenCalledWith(raw, "t=1,v1=abc");
  });
});
