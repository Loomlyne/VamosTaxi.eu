// apps/web/lib/security/input-caps.test.ts
//
// Security S11 (2026-10-05): length caps on the checkout Pay body and the review submit, and the
// e-mail checked on the server with the same rule the page runs. Each cap is proven both ways:
// a value at the cap passes, one character more is refused.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_FIELD_MAX, checkoutIntentSchema } from "../checkout/intent-schema";
import { REVIEW_FIELD_MAX, reviewFieldsWithinCaps } from "../reviews/submit-caps";

const calls = { turnstile: 0, db: 0 };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { QUOTE_RATE_LIMITER: {}, TURNSTILE_SECRET_KEY: "test" } }),
}));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/abuse/rate-limit", () => ({ checkWriteRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: async () => {
    calls.turnstile += 1;
    return { ok: true };
  },
}));
vi.mock("@/lib/account/session", () => ({ customerClaims: async () => null }));
vi.mock("@/lib/checkout/manage-token", () => ({ hashManageToken: async () => "abcd" }));
vi.mock("@/lib/db/identity", () => {
  const run = async (fn: (sql: unknown) => unknown) => {
    calls.db += 1;
    return fn(async () => [{ review_id: "r", booking_id: "b" }]);
  };
  return {
    asGuest: async (_e: unknown, _h: string, fn: (sql: unknown) => unknown) => run(fn),
    asCustomer: async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => run(fn),
    asSystem: async (_e: unknown, fn: (sql: unknown) => unknown) => run(fn),
  };
});

import { POST as reviewSubmit } from "../../app/api/reviews/submit/route";

const body = {
  quote_id: "00000000-0000-4000-8000-000000000001",
  lock: "v1.payload.mac",
  vehicle_class: "economy",
  contact: { name: "Ada Lovelace", email: "ada@example.test", phone: "+41790000000" },
  locale: "en",
  display_currency: "CHF",
  idempotency_key: "4f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f",
  coupon: "WELCOME10",
  trip: {
    from: "Zurich Airport",
    fid: "mbx-from",
    to: "Bahnhofstrasse 1, Zurich",
    tid: "mbx-to",
    gs: "11111111-1111-4111-8111-111111111111",
    when: "2026-12-01T09:30",
    pax: 2,
    bags: 1,
    flight: "LX318",
  },
};

function withContact(patch: Partial<typeof body.contact>) {
  return { ...body, contact: { ...body.contact, ...patch } };
}

function ok(value: unknown): boolean {
  return checkoutIntentSchema.safeParse(value).success;
}

describe("S11: checkout Pay body caps", () => {
  it("a real body passes", () => {
    expect(ok(body)).toBe(true);
  });

  it("name, phone, coupon, idempotency key and lock: at the cap passes, one more is refused", () => {
    const n = CHECKOUT_FIELD_MAX;
    expect(ok(withContact({ name: "a".repeat(n.name) }))).toBe(true);
    expect(ok(withContact({ name: "a".repeat(n.name + 1) }))).toBe(false);
    expect(ok(withContact({ phone: "1".repeat(n.phone) }))).toBe(true);
    expect(ok(withContact({ phone: "1".repeat(n.phone + 1) }))).toBe(false);
    expect(ok({ ...body, coupon: "C".repeat(n.coupon) })).toBe(true);
    expect(ok({ ...body, coupon: "C".repeat(n.coupon + 1) })).toBe(false);
    expect(ok({ ...body, idempotency_key: "k".repeat(n.idempotencyKey) })).toBe(true);
    expect(ok({ ...body, idempotency_key: "k".repeat(n.idempotencyKey + 1) })).toBe(false);
    expect(ok({ ...body, lock: "l".repeat(n.lock) })).toBe(true);
    expect(ok({ ...body, lock: "l".repeat(n.lock + 1) })).toBe(false);
  });

  it("the e-mail: at 254 passes, 255 is refused", () => {
    const at = (len: number) => `${"a".repeat(len - "@example.ch".length)}@example.ch`;
    expect(at(254)).toHaveLength(254);
    expect(ok(withContact({ email: at(254) }))).toBe(true);
    expect(ok(withContact({ email: at(255) }))).toBe(false);
  });

  it("the e-mail is checked on the server with the page's own rule", () => {
    for (const bad of ["ada", "ada@", "ada@example", "ada example@x.ch", "@example.ch"]) {
      expect(ok(withContact({ email: bad })), bad).toBe(false);
    }
    for (const good of ["ada@example.ch", "a.b+c@sub.example.co.uk", " ada@example.ch "]) {
      expect(ok(withContact({ email: good })), good).toBe(true);
    }
  });

  it("the caps sit far above what the page sends", () => {
    expect(CHECKOUT_FIELD_MAX.phone).toBeGreaterThanOrEqual(16);
    expect(CHECKOUT_FIELD_MAX.idempotencyKey).toBeGreaterThanOrEqual(36);
    // The reprice route already accepts locks up to 8192; Pay must take anything it hands back.
    expect(CHECKOUT_FIELD_MAX.lock).toBeGreaterThanOrEqual(8192);
  });
});

describe("S11: review submit caps", () => {
  beforeEach(() => {
    calls.turnstile = 0;
    calls.db = 0;
  });

  function post(extra: Record<string, unknown>): Request {
    return new Request("https://vamostaxi.site/api/reviews/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company: 5, chauffeur: 5, overall: 5, turnstileToken: "t", token: "token-a", ...extra }),
    });
  }

  it("reviewFieldsWithinCaps: every field at its cap passes, one more fails", () => {
    for (const [key, max] of Object.entries(REVIEW_FIELD_MAX)) {
      expect(reviewFieldsWithinCaps({ [key]: "x".repeat(max) }), key).toBe(true);
      expect(reviewFieldsWithinCaps({ [key]: "x".repeat(max + 1) }), key).toBe(false);
    }
    expect(reviewFieldsWithinCaps({ comment: 12 })).toBe(true);
  });

  it("a comment one character over the cap is a 400 before Turnstile or the database", async () => {
    const res = await reviewSubmit(post({ comment: "x".repeat(REVIEW_FIELD_MAX.comment + 1) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, code: "invalid-input" });
    expect(calls).toEqual({ turnstile: 0, db: 0 });
  });

  it("a comment at the cap is accepted", async () => {
    const res = await reviewSubmit(post({ comment: "x".repeat(REVIEW_FIELD_MAX.comment) }));
    expect(res.status).toBe(200);
    expect(calls.turnstile).toBe(1);
  });
});
