import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKOUT_REFUSALS } from "./errors";
import { payLinkSessionId, resolvePayLinkRefusal } from "./pay-link-state";

const asCheckout = vi.fn();
const createCheckoutSession = vi.fn();
const retrieveCheckoutSession = vi.fn();
const loadOpenPayment = vi.fn();
const attachPayment = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { STRIPE_PUBLISHABLE_KEY: "pk_test_x", STRIPE_CHECKOUT_TWINT: "off" } }),
}));
vi.mock("@/lib/db/identity", () => ({ asCheckout: (...a: unknown[]) => asCheckout(...a) }));
vi.mock("@/lib/checkout/load-open-payment", () => ({ loadOpenPayment: (...a: unknown[]) => loadOpenPayment(...a) }));
vi.mock("@/lib/checkout/attach-payment", () => ({ attachPayment: (...a: unknown[]) => attachPayment(...a) }));
vi.mock("@/lib/checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
    retrieveCheckoutSession: (...a: unknown[]) => retrieveCheckoutSession(...a),
  };
});

const here = dirname(fileURLToPath(import.meta.url));

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("pay-link refusal codes (errors.ts)", () => {
  it("adds pay_link_paid, pay_link_refunded_duplicate and pay_link_expired as 409 with no action", () => {
    for (const code of ["pay_link_paid", "pay_link_refunded_duplicate", "pay_link_expired"] as const) {
      expect(CHECKOUT_REFUSALS[code]).toEqual({ status: 409, action: null });
    }
  });
});

describe("payLinkSessionId", () => {
  it("accepts a Stripe Checkout Session id in test or live mode", () => {
    expect(payLinkSessionId("cs_test_a1B2c3")).toBe("cs_test_a1B2c3");
    expect(payLinkSessionId("cs_live_Z9y8")).toBe("cs_live_Z9y8");
  });

  it("ignores anything else instead of refusing the open call (T-26.1-48)", () => {
    for (const value of [undefined, null, "", 42, "cs_test_", "pi_test_abc", "cs_test_abc'--", "cs_other_abc", " cs_test_abc"]) {
      expect(payLinkSessionId(value)).toBeNull();
    }
  });
});

describe("resolvePayLinkRefusal", () => {
  it("D-21: a paid booking answers pay_link_paid with the reference", async () => {
    const readState = vi.fn().mockResolvedValue({ state: "paid", reference: "VT-26-0001" });
    const res = await resolvePayLinkRefusal({ readState }, null);
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ ok: false, code: "pay_link_paid", reference: "VT-26-0001" });
    expect(readState).toHaveBeenCalledWith(null);
  });

  it("D-22: the recipient's refunded duplicate session answers pay_link_refunded_duplicate", async () => {
    const readState = vi.fn().mockResolvedValue({ state: "refunded_duplicate", reference: "VT-26-0002" });
    const res = await resolvePayLinkRefusal({ readState }, "cs_test_abc");
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ ok: false, code: "pay_link_refunded_duplicate", reference: "VT-26-0002" });
    expect(readState).toHaveBeenCalledWith("cs_test_abc");
  });

  it("an expired, cancelled or unknown link answers pay_link_expired with no reference", async () => {
    const readState = vi.fn().mockResolvedValue({ state: "expired", reference: null });
    const res = await resolvePayLinkRefusal({ readState }, null);
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual({ ok: false, code: "pay_link_expired" });
  });

  it("no state row, or a contradictory payable state, is still pay_link_expired", async () => {
    for (const row of [null, { state: "payable", reference: "VT-26-0003" }, { state: "paid", reference: null }]) {
      const res = await resolvePayLinkRefusal({ readState: vi.fn().mockResolvedValue(row) }, null);
      expect(await body(res)).toEqual({ ok: false, code: "pay_link_expired" });
    }
  });

  it("answers private, no-store", async () => {
    const res = await resolvePayLinkRefusal({ readState: vi.fn().mockResolvedValue(null) }, null);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("pay-link open route wiring", () => {
  const src = readFileSync(join(here, "../../app/api/checkout/pay-link/open/route.ts"), "utf8");

  it("reads checkout_pay_link_state on a hash miss and passes the checked session id", () => {
    expect(src).toContain("public.checkout_pay_link_state(");
    expect(src).toContain("resolvePayLinkRefusal(");
    expect(src).toContain("payLinkSessionId(");
  });
});


describe("pay-link open route, hosted (D-46)", () => {
  const ROW = {
    booking_id: "b1",
    reference: "VT-26-0007",
    quote_id: "q1",
    locale: "de",
    charged_rappen: 6486,
    pickup_text: "Zurich Airport",
    dropoff_text: "Bahnhofstrasse 1",
    payer_email: "ada@example.test",
    snapshot_expires_at: new Date(Date.now() + 20 * 3600 * 1000),
    token_expires_at: new Date(Date.now() + 20 * 3600 * 1000),
  };
  const URL_A = "https://checkout.stripe.test/c/pay/cs_test_a1";

  function call(): Promise<Response> {
    return import("../../app/api/checkout/pay-link/open/route").then(({ POST }) =>
      POST(
        new Request("https://vamostaxi.site/api/checkout/pay-link/open", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://vamostaxi.site" },
          body: JSON.stringify({ token: "dG9rZW4tYWJjZGVmZ2g" }),
        }),
      ),
    );
  }

  function wireDb(opts: { row?: unknown; open?: unknown } = {}) {
    let n = 0;
    asCheckout.mockImplementation(async (_env: unknown, _c: unknown, fn: (sql: unknown) => unknown) => {
      n += 1;
      if (n === 1) return [opts.row ?? ROW];
      if (n === 2) return [{ is_test: false }];
      return fn(() => []);
    });
    loadOpenPayment.mockResolvedValue(opts.open ?? null);
    attachPayment.mockResolvedValue(undefined);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unpaid token: hosted session, returns url + reference + amount, no client_secret", async () => {
    wireDb();
    createCheckoutSession.mockResolvedValue({ id: "cs_test_a1", url: URL_A, payment_intent: null, client_secret: null });
    const res = await call();
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({ ok: true, url: URL_A, reference: "VT-26-0007", amount_rappen: 6486 });
    expect(json).not.toHaveProperty("client_secret");
    const input = createCheckoutSession.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(input.uiMode).toBe("hosted_page");
    expect(String(input.successUrl)).toContain("/api/checkout/return?locale=de&session_id={CHECKOUT_SESSION_ID}");
    expect(String(input.cancelUrl)).toBe("https://vamostaxi.site/de/checkout/pay/dG9rZW4tYWJjZGVmZ2g");
    expect(input.chargedRappen).toBe(6486);
  });

  it("an open hosted session with the same amount is reused", async () => {
    wireDb({ open: { stripe_checkout_session_id: "cs_test_a1" } });
    retrieveCheckoutSession.mockResolvedValue({
      id: "cs_test_a1",
      url: URL_A,
      status: "open",
      currency: "chf",
      amount_total: 6486,
    });
    const res = await call();
    expect(((await res.json()) as Record<string, unknown>).url).toBe(URL_A);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("an open session with a different amount is not reused", async () => {
    wireDb({ open: { stripe_checkout_session_id: "cs_test_old" } });
    retrieveCheckoutSession.mockResolvedValue({
      id: "cs_test_old",
      url: "https://checkout.stripe.test/old",
      status: "open",
      currency: "chf",
      amount_total: 100,
    });
    createCheckoutSession.mockResolvedValue({ id: "cs_test_new", url: URL_A, payment_intent: null });
    const res = await call();
    expect(((await res.json()) as Record<string, unknown>).url).toBe(URL_A);
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("no token row and no state row: pay_link_expired, Stripe never called", async () => {
    asCheckout.mockResolvedValue([]);
    const res = await call();
    expect(res.status).toBe(409);
    expect(((await res.json()) as Record<string, unknown>).code).toBe("pay_link_expired");
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("no card-form leftovers in the route source", () => {
    const src = readFileSync(join(here, "../../app/api/checkout/pay-link/open/route.ts"), "utf8");
    expect(src).toContain('"hosted_page"');
    expect(src).not.toContain("client_secret");
    expect(src).not.toContain("hosted_page: false");
  });
});
