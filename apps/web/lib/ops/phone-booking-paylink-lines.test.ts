// apps/web/lib/ops/phone-booking-paylink-lines.test.ts
//
// 26.2-BP A6: the pay-link e-mail lists the extras and the coupon that make up the
// charged total. Fakes only, no Hyperdrive, no Stripe, no Resend.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendPayLink = vi.fn();
const retrieve = vi.fn();
let unpaid: Record<string, unknown> = {};
let mailRow: Record<string, unknown> | null = null;
let mailReadFails = false;

function fakeSql() {
  return (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("phone_booking_unpaid_read")) return Promise.resolve([unpaid]);
    if (text.includes("checkout_booking_for_email")) {
      if (mailReadFails) return Promise.reject(new Error("permission denied for function checkout_booking_for_email"));
      return Promise.resolve(mailRow ? [mailRow] : []);
    }
    return Promise.resolve([]);
  };
}

vi.mock("../db/identity", () => ({
  asSystem: (_env: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
  asCheckout: (_env: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
}));
vi.mock("../checkout/manage-token", () => ({
  mintManageToken: async () => ({ raw: "rawtoken0123456789", hash: new Uint8Array(32) }),
}));
vi.mock("../checkout/set-pay-link", () => ({ setPayLink: async () => "2026-09-29T00:00:00Z" }));
vi.mock("../checkout/pay-link-hosted-session", () => ({ openHostedPayLinkSession: vi.fn() }));
vi.mock("@vamos/emails/confirmation", () => ({ sendPayLink: (...a: unknown[]) => sendPayLink(...a) }));
vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    retrieveCheckoutSession: (...a: unknown[]) => retrieve(...a),
  };
});

import { staffPayLink } from "./phone-booking";

const env = { RESEND_API_KEY: "re_test" } as unknown as CloudflareEnv;

function unpaidRow() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    reference: "VT-26-0001",
    status: "pending",
    contact_name: "Ada",
    contact_email: "ada@example.test",
    contact_phone: "+41790000000",
    locale: "en",
    billing_kind: "individual",
    payer_email: "ada@example.test",
    pickup_text: "ZRH",
    dropoff_text: "Zurich",
    scheduled_local: "2026-10-06T10:00",
    class_slug: "economy",
    pax: 1,
    bags: 0,
    charged_rappen: 10500,
    captured_at: null,
    stripe_checkout_session_id: "cs_test_h1",
    is_test: false,
    quote_id: "00000000-0000-4000-8000-0000000000a1",
    snap_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    snap_total_rappen: 10500,
  };
}

function sentLink() {
  return sendPayLink.mock.calls[0]?.[1] as {
    totalRappen: number | null;
    extras: { name: string; amountRappen: number | null }[];
    coupon: string | null;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendPayLink.mockResolvedValue({ ok: true });
  retrieve.mockResolvedValue({ id: "cs_test_h1", status: "open" });
  unpaid = unpaidRow();
  mailRow = null;
  mailReadFails = false;
});

describe("staffPayLink mail lines (A6)", () => {
  it("lists the ticked extras and the coupon behind the charged total", async () => {
    mailRow = {
      lines: [
        { kind: "fare", code: "fare", amount_rappen: 10000 },
        { kind: "surcharge", code: "child_seat", amount_rappen: 1000, params: { name: "Child seat" } },
        { kind: "coupon", code: "coupon", amount_rappen: -500 },
      ],
      policy_extras: null,
      coupon_code: "WELCOME",
    };
    const res = await staffPayLink(env, "VT-26-0001", true);
    expect(res.ok && res.sent).toBe(true);
    const link = sentLink();
    expect(link.totalRappen).toBe(10500);
    expect(link.extras.map((e) => e.name)).toEqual(["Child seat"]);
    expect(link.coupon).toBe("WELCOME");
  });

  it("reads the extras from the policy for a snapshot written before lines carried names", async () => {
    mailRow = { lines: null, policy_extras: ["child_seat"], coupon_code: null };
    await staffPayLink(env, "VT-26-0001", true);
    const link = sentLink();
    expect(link.extras.map((e) => e.name)).toEqual(["Child seat"]);
    expect(link.coupon).toBeNull();
  });

  it("sends no extras and no coupon for a plain booking", async () => {
    mailRow = {
      lines: [{ kind: "fare", code: "fare", amount_rappen: 10500 }],
      policy_extras: null,
      coupon_code: null,
    };
    await staffPayLink(env, "VT-26-0001", true);
    const link = sentLink();
    expect(link.extras).toEqual([]);
    expect(link.coupon).toBeNull();
  });

  it("still sends the pay link when the mail rows cannot be read", async () => {
    mailReadFails = true;
    const res = await staffPayLink(env, "VT-26-0001", true);
    expect(res.ok && res.sent).toBe(true);
    const link = sentLink();
    expect(link.totalRappen).toBe(10500);
    expect(link.extras).toEqual([]);
    expect(link.coupon).toBeNull();
  });
});
