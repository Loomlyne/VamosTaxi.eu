import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationName = "20260923120000_checkout_requote_cancel.sql";
const migration = readFileSync(
  join(here, "../../../../packages/db/supabase/migrations", migrationName),
  "utf8",
);

describe("checkout_requote_cancel migration", () => {
  it("sorts after the coupons migration and is not an apply script", () => {
    expect(migrationName > "20260920000003_coupons_per_rate_version.sql").toBe(true);
    expect(migration.toLowerCase()).not.toContain("supabase db push");
  });

  it("is a vamos_checkout-only definer that writes canceled, not a fare", () => {
    const sql = migration.toLowerCase();
    expect(sql).toContain("checkout_requote_cancel");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("vamos_checkout");
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*from\s+public/);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*from\s+anon/);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*from\s+authenticated/);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function[\s\S]*to\s+vamos_checkout/);
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*\bto\s+authenticated\b/);
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*\bto\s+anon\b/);
    expect(sql).toMatch(/status\s*=\s*'canceled'/);
    expect(sql).toMatch(/status\s*=\s*'cancelled'/);
    expect(sql).toContain("'pending'");
    expect(sql).toContain("'quote'");
    expect(sql).not.toContain("stripe");
    expect(sql).not.toContain("booking_refunds");
    expect(sql).not.toContain("extract(epoch");
    expect(sql).not.toMatch(/\bsk_/);
  });
});

describe("POST /api/checkout/requote", () => {
  const src = readFileSync(join(here, "../../app/api/checkout/requote/route.ts"), "utf8");

  it("calls the guest definer after CSRF and does not use account cancel", () => {
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post.indexOf("csrfForbidden(request)")).toBeLessThan(post.indexOf("asCheckout"));
    expect(src).toContain("asCheckout");
    expect(src).toContain("asCheckout(env, null");
    expect(src).toContain("select * from public.checkout_requote_cancel");
    expect(src).not.toContain("checkout_cancel_unpaid");
    expect(src).not.toContain("asCustomer");
    expect(src).not.toContain("/api/checkout/abandon");
  });

  it("returns requote_not_applied, not ok, when the function is undefined", () => {
    const line = src.split("\n").find((row) => row.includes("requote_not_applied"));
    expect(line).toBeDefined();
    expect(line).toMatch(/ok:\s*false/);
    expect(line).toMatch(/code:\s*"requote_not_applied"/);
    expect(line).toMatch(/503/);
    expect(line).not.toContain("pricing_not_live");
    expect(line).not.toContain("quote_expired");
    expect(line).not.toContain("payCouldNotStart");
    expect(src).toContain("42883");
    expect(src).toContain("invalid_request");
  });

  it("does not expire or mint on the legacy UAE publishable prefix", () => {
    const legacy = src.indexOf("stripeAccountIsLegacyUaeTest");
    const expire = src.indexOf("expireCheckoutSession");
    const fromEnv = src.indexOf("stripeFromEnv");
    expect(legacy).toBeGreaterThan(-1);
    expect(src).toContain("!stripeAccountIsLegacyUaeTest");
    expect(expire).toBeGreaterThan(legacy);
    expect(fromEnv).toBeGreaterThan(legacy);
    expect(src).not.toContain("createCheckoutSession");
    expect(src).not.toContain("sessions.create");
    expect(src).not.toContain("stripePublishableKey");
  });
  it("returns ok true only after expire resolved or a successful lookup found no session", () => {
    for (const code of ["session_lookup_failed", "session_not_expired"]) {
      const lines = src.split("\n").filter((row) => row.includes(code));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(/ok:\s*false/);
        expect(line).toMatch(/503/);
        expect(line).not.toContain("pricing_not_live");
        expect(line).not.toContain("quote_expired");
        expect(line).not.toContain("payCouldNotStart");
      }
    }
    const lookup = src.indexOf("checkout_open_payment");
    const lookupCatch = src.indexOf("catch", lookup);
    const afterLookup = src.slice(lookupCatch, src.indexOf("if (sessionId)", lookupCatch));
    expect(afterLookup).toContain("session_lookup_failed");
    expect(afterLookup).not.toContain("sessionId = null");
    expect(afterLookup).not.toContain("checkout_requote_cancel");
    const expireCall = src.indexOf("expireCheckoutSession(");
    const afterExpire = src.slice(expireCall);
    const catchRel = afterExpire.indexOf("catch");
    const okTrue = afterExpire.indexOf("ok: true");
    expect(catchRel).toBeGreaterThan(-1);
    expect(okTrue).toBeGreaterThan(catchRel);
    const between = afterExpire.slice(catchRel, okTrue);
    expect(between).toContain("session_not_expired");
    expect(between).toContain("return");
    expect(between).toContain("checkout_requote_cancel");
    expect(between).not.toContain("{ ok: true }");
    expect(src).not.toContain("createRefund");
    expect(src).not.toContain("sessionId = null");
  });
});

// D-20 (26.1-29): requote must not cancel a booking whose pay link is still
// held — the recipient's link and the traveller's lock share one 24 h clock.
const h = vi.hoisted(() => ({
  queries: [] as string[],
  holdRows: [] as unknown[],
  holdError: null as unknown,
  openRows: [] as unknown[],
  expire: vi.fn(async (_stripe: unknown, _id: string) => undefined),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { STRIPE_PUBLISHABLE_KEY: "pk_test_route" } }),
}));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/checkout/errors", async () => import("./errors"));
vi.mock("@/lib/checkout/charge-gate", () => ({ stripeAccountIsLegacyUaeTest: () => false }));
vi.mock("@/lib/checkout/stripe", () => ({
  stripeFromEnv: () => ({}),
  expireCheckoutSession: (stripe: unknown, id: string) => h.expire(stripe, id),
}));
vi.mock("@/lib/db/identity", () => ({
  asCheckout: async (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) => {
    const sql = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      h.queries.push(text);
      if (text.includes("checkout_booking_hold_until")) {
        if (h.holdError) throw h.holdError;
        return h.holdRows;
      }
      if (text.includes("checkout_open_payment")) return h.openRows;
      return [];
    };
    return fn(sql);
  },
}));

describe("POST /api/checkout/requote — the pay-link hold (D-20, 26.1-29)", () => {
  const QUOTE = "21500000-0000-4000-8000-00000000000a";
  const HOLD = new Date("2026-09-29T10:00:00.000Z");

  function post() {
    return new Request("https://vamostaxi.site/api/checkout/requote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote_id: QUOTE }),
    });
  }
  async function call() {
    const { POST } = await import("../../app/api/checkout/requote/route");
    const res = await POST(post());
    return { res, body: (await res.json()) as Record<string, unknown> };
  }
  const cancelled = () => h.queries.some((q) => q.includes("checkout_requote_cancel"));

  beforeEach(() => {
    h.queries.length = 0;
    h.holdRows = [];
    h.holdError = null;
    h.openRows = [{ stripe_checkout_session_id: "cs_test_open" }];
    h.expire.mockClear();
  });

  it("an open hold keeps the booking: no expire, no cancel, 409 hold_open", async () => {
    h.holdRows = [{ hold_until: HOLD, held: true }];
    const { res, body } = await call();
    expect(res.status).toBe(409);
    expect(body).toEqual({ ok: false, code: "hold_open", hold_until: HOLD.toISOString() });
    expect(h.expire).not.toHaveBeenCalled();
    expect(cancelled()).toBe(false);
    expect(h.queries.some((q) => q.includes("checkout_open_payment"))).toBe(false);
  });

  it("a hold already past behaves exactly as before: expire, then cancel, ok true", async () => {
    h.holdRows = [{ hold_until: new Date("2026-09-01T10:00:00.000Z"), held: false }];
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(h.expire).toHaveBeenCalledWith({}, "cs_test_open");
    expect(cancelled()).toBe(true);
  });

  it("no hold behaves exactly as before", async () => {
    h.holdRows = [{ hold_until: null, held: false }];
    h.openRows = [];
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(h.expire).not.toHaveBeenCalled();
    expect(cancelled()).toBe(true);
  });

  it("a failed hold read fails closed: 503, no expire, no cancel", async () => {
    h.holdError = Object.assign(new Error("boom"), { code: "08006" });
    const { res, body } = await call();
    expect(res.status).toBe(503);
    expect(body).toEqual({ ok: false, code: "hold_lookup_failed" });
    expect(h.expire).not.toHaveBeenCalled();
    expect(cancelled()).toBe(false);
  });

  it("the hold is judged on the database clock, loaded before the session lookup", () => {
    const src = readFileSync(join(here, "../../app/api/checkout/requote/route.ts"), "utf8");
    const post = src.slice(src.indexOf("export async function POST"));
    const hold = post.indexOf("public.checkout_booking_hold_until(");
    expect(hold).toBeGreaterThan(post.indexOf("csrfForbidden(request)"));
    expect(hold).toBeLessThan(post.indexOf("public.checkout_open_payment("));
    expect(hold).toBeLessThan(post.indexOf("expireCheckoutSession("));
    expect(src).toMatch(/hold_until\s*>\s*now\(\)/);
    expect(src).not.toMatch(/body\.hold_until|record\.hold_until/);
  });
});
