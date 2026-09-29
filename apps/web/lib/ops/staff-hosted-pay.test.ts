// apps/web/lib/ops/staff-hosted-pay.test.ts
//
// G8 (D-48): staff pay-link, Take card and the extra-fare payment all run on
// Stripe-hosted sessions, which have a url and no client secret. Fakes only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openHosted = vi.fn();
const retrieve = vi.fn();
const createSession = vi.fn();
const sendPayLink = vi.fn();
const setPayLink = vi.fn();
let sqlHandler: (text: string) => unknown[] = () => [];

vi.mock("../db/identity", () => ({
  asSystem: (_env: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
  asCheckout: (_env: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
}));
vi.mock("@/lib/db/identity", () => ({
  asSystem: (_env: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
  asCheckout: (_env: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
  asCustomer: vi.fn(),
  asGuest: vi.fn(),
}));
vi.mock("../checkout/manage-token", () => ({
  mintManageToken: async () => ({ raw: "rawtoken0123456789", hash: new Uint8Array(32) }),
}));
vi.mock("../checkout/set-pay-link", () => ({ setPayLink: (...a: unknown[]) => setPayLink(...a) }));
vi.mock("../checkout/pay-link-hosted-session", () => ({
  openHostedPayLinkSession: (...a: unknown[]) => openHosted(...a),
}));
vi.mock("@vamos/emails/confirmation", () => ({ sendPayLink: (...a: unknown[]) => sendPayLink(...a) }));
vi.mock("@/lib/lifecycle/notify-lifecycle", () => ({ notifyFlightNumber: vi.fn(), notifyTimeChange: vi.fn() }));
vi.mock("./must-fix-mail", () => ({ deliverOverlapMustFix: vi.fn() }));
vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    retrieveCheckoutSession: (...a: unknown[]) => retrieve(...a),
    createCheckoutSession: (...a: unknown[]) => createSession(...a),
    expireCheckoutSession: vi.fn(),
  };
});

function fakeSql() {
  return (strings: TemplateStringsArray) => Promise.resolve(sqlHandler(strings.join("?")));
}

import { staffPayLink, staffTakeCard } from "./phone-booking";
import { acceptPaidEdit, staffExtraPayUrl } from "./edit-request";

const env = { RESEND_API_KEY: "re_test" } as unknown as CloudflareEnv;
const HOSTED_OPEN = { id: "cs_test_h1", status: "open", url: "https://checkout.stripe.test/c/pay/cs_test_h1", currency: "chf", amount_total: 8000 };

function unpaidRow(over: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    reference: "VT-26-0001",
    status: "pending",
    contact_name: "Ada",
    contact_email: "ada@example.test",
    contact_phone: "+41790000000",
    locale: "de",
    billing_kind: "individual",
    payer_email: "ada@example.test",
    pickup_text: "ZRH",
    dropoff_text: "Zurich",
    scheduled_local: "2026-10-06T10:00:00",
    class_slug: "economy",
    pax: 1,
    bags: 0,
    charged_rappen: 8000,
    captured_at: null,
    stripe_checkout_session_id: "cs_test_h1",
    is_test: false,
    quote_id: "00000000-0000-4000-8000-0000000000a1",
    snap_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    snap_total_rappen: 8000,
    ...over,
  };
}

function bookingSql(row: Record<string, unknown>) {
  return (text: string) => {
    if (text.includes("phone_booking_unpaid_read")) return [row];
    return [];
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendPayLink.mockResolvedValue({ ok: true });
  setPayLink.mockResolvedValue("2026-09-29T00:00:00Z");
});

describe("staffPayLink with a hosted session (no client_secret)", () => {
  it("mints the token, e-mails /checkout/pay/<token> and answers OK", async () => {
    sqlHandler = bookingSql(unpaidRow());
    retrieve.mockResolvedValue(HOSTED_OPEN);
    const res = await staffPayLink(env, "VT-26-0001", true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sent).toBe(true);
    expect(res.payUrl).toContain("/checkout/pay/rawtoken0123456789");
    expect(res).not.toHaveProperty("clientSecretHex");
    expect(res).not.toHaveProperty("publishableKey");
    expect(setPayLink).toHaveBeenCalledTimes(1);
    expect(sendPayLink).toHaveBeenCalledTimes(1);
  });

  it("send:false mints the token without mailing", async () => {
    sqlHandler = bookingSql(unpaidRow());
    retrieve.mockResolvedValue(HOSTED_OPEN);
    const res = await staffPayLink(env, "VT-26-0001", false);
    expect(res.ok && res.sent).toBe(false);
    expect(sendPayLink).not.toHaveBeenCalled();
  });

  it("an expired, unreadable or re-priced stored session still sends the link (the pay page makes a fresh one)", async () => {
    sqlHandler = bookingSql(unpaidRow());
    for (const stored of [null, { ...HOSTED_OPEN, status: "expired" }, { ...HOSTED_OPEN, amount_total: 9000 }, { ...HOSTED_OPEN, url: null }]) {
      sendPayLink.mockClear();
      setPayLink.mockClear();
      retrieve.mockResolvedValue(stored);
      const res = await staffPayLink(env, "VT-26-0001", true);
      expect(res.ok && res.sent).toBe(true);
      expect(setPayLink).toHaveBeenCalledTimes(1);
      expect(sendPayLink).toHaveBeenCalledTimes(1);
    }
  });

  it("a complete session refuses (money may be in flight), with no token and no e-mail", async () => {
    sqlHandler = bookingSql(unpaidRow());
    for (const stored of [{ ...HOSTED_OPEN, status: "complete" }, { ...HOSTED_OPEN, status: "complete", payment_status: "paid" }]) {
      retrieve.mockResolvedValue(stored);
      expect(await staffPayLink(env, "VT-26-0001", true)).toEqual({ ok: false, code: "already-paid" });
    }
    expect(setPayLink).not.toHaveBeenCalled();
    expect(sendPayLink).not.toHaveBeenCalled();
  });

  it("keeps the frozen, paid, test and no-email refusals", async () => {
    retrieve.mockResolvedValue(HOSTED_OPEN);
    sqlHandler = bookingSql(unpaidRow({ status: "cancelled" }));
    expect(await staffPayLink(env, "x", true)).toEqual({ ok: false, code: "frozen" });
    sqlHandler = bookingSql(unpaidRow({ captured_at: "2026-09-29" }));
    expect(await staffPayLink(env, "x", true)).toEqual({ ok: false, code: "already-paid" });
    sqlHandler = bookingSql(unpaidRow({ is_test: true }));
    expect(await staffPayLink(env, "x", true)).toEqual({ ok: false, code: "is-test" });
    sqlHandler = bookingSql(unpaidRow({ contact_email: "" }));
    expect(await staffPayLink(env, "x", true)).toEqual({ ok: false, code: "no-email" });
  });
});

describe("staffTakeCard", () => {
  it("returns the Stripe hosted URL and sends Back to the ops booking", async () => {
    sqlHandler = bookingSql(unpaidRow());
    openHosted.mockResolvedValue({ ok: true, session: { id: "cs_test_h1", url: HOSTED_OPEN.url } });
    const res = await staffTakeCard(env, "VT-26-0001", "https://dashboard.vamostaxi.site/");
    expect(res).toMatchObject({ ok: true, url: HOSTED_OPEN.url, reference: "VT-26-0001" });
    const input = openHosted.mock.calls[0]![1] as Record<string, unknown>;
    expect(input.cancelUrl).toBe("https://dashboard.vamostaxi.site/bookings/VT-26-0001");
    expect(String(input.successUrl)).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(input.charged).toBe(8000);
    expect(input.quoteId).toMatch(/^00000000/);
  });

  it("refuses a paid or expired booking without opening Stripe", async () => {
    sqlHandler = bookingSql(unpaidRow({ captured_at: "2026-09-29" }));
    expect(await staffTakeCard(env, "x", "https://dashboard.vamostaxi.site")).toEqual({ ok: false, code: "already-paid" });
    sqlHandler = bookingSql(unpaidRow({ snap_expires_at: new Date(Date.now() - 1000).toISOString() }));
    expect(await staffTakeCard(env, "x", "https://dashboard.vamostaxi.site")).toEqual({ ok: false, code: "session-expired" });
    expect(openHosted).not.toHaveBeenCalled();
  });

  it("an open pay-link hold keeps Take card working after the snapshot expired; both expired refuses", async () => {
    // The loader selects greatest(snapshot expiry, hold_until) as snap_expires_at.
    const held = new Date(Date.now() + 2 * 3600_000);
    sqlHandler = (text) => {
      if (text.includes("phone_booking_unpaid_read")) {
        // The pay window rule lives in the definer function.
        expect(readFileSync(join(__dirname, "../../../../packages/db/supabase/migrations/20260930210000_system_role_narrow_reads.sql"), "utf8")).toContain(
          "greatest(s.expires_at, coalesce(b.hold_until, s.expires_at))",
        );
      }
      return bookingSql(unpaidRow({ snap_expires_at: held.toISOString() }))(text);
    };
    openHosted.mockResolvedValue({ ok: true, session: { id: "cs_test_h1", url: HOSTED_OPEN.url } });
    const res = await staffTakeCard(env, "VT-26-0001", "https://dashboard.vamostaxi.site");
    expect(res).toMatchObject({ ok: true, url: HOSTED_OPEN.url });
    expect((openHosted.mock.calls[0]![1] as { expiresAt: Date }).expiresAt.getTime()).toBe(held.getTime());
    openHosted.mockClear();
    sqlHandler = bookingSql(unpaidRow({ snap_expires_at: new Date(Date.now() - 1000).toISOString() }));
    expect(await staffTakeCard(env, "VT-26-0001", "https://dashboard.vamostaxi.site")).toEqual({ ok: false, code: "session-expired" });
    expect(openHosted).not.toHaveBeenCalled();
  });

  it("maps a refusal from the shared builder to a staff code", async () => {
    sqlHandler = bookingSql(unpaidRow());
    openHosted.mockResolvedValue({ ok: false, response: Response.json({ code: "quote_already_booked" }, { status: 409 }) });
    expect(await staffTakeCard(env, "x", "https://dashboard.vamostaxi.site")).toEqual({ ok: false, code: "already-paid" });
  });
});

describe("extra-fare payment on a hosted session", () => {
  const BOOKING = "00000000-0000-4000-8000-000000000001";

  it("acceptPaidEdit creates a hosted kind=extra session for the difference, returning to the ops booking", async () => {
    sqlHandler = (text) => {
      if (text.includes("booking_edit_request_accept")) {
        return [{ request_id: "00000000-0000-4000-8000-0000000000e1", booking_id: BOOKING, outcome: "extra_required", difference_rappen: 3000, extra_snapshot_id: 5, extra_session_id: null, hours_before: 48, original_payment_id: 1, original_intent_id: "pi_1" }];
      }
      if (text.includes("edit_request_booking_contact")) return [{ reference: "VT-26-0001", contact_email: "ada@example.test", locale: "en" }];
      return [];
    };
    createSession.mockResolvedValue({ id: "cs_test_extra1", url: "https://checkout.stripe.test/c/pay/cs_test_extra1" });
    const res = await acceptPaidEdit(
      env,
      { sub: "00000000-0000-4000-8000-0000000000aa" } as never,
      "VT-26-0001",
      { requestId: "00000000-0000-4000-8000-0000000000e1", payload: {} as never },
      "https://dashboard.vamostaxi.site",
    );
    expect(res).toMatchObject({ ok: true, outcome: "extra_required", extraSessionId: "cs_test_extra1", differenceRappen: 3000 });
    const input = createSession.mock.calls[0]![1] as Record<string, unknown>;
    expect(input.uiMode).toBe("hosted_page");
    expect(input.chargedRappen).toBe(3000);
    expect(input.extra).toBeTruthy();
    expect(input).not.toHaveProperty("returnUrl");
    expect(String(input.successUrl)).toBe("https://vamostaxi.site/api/checkout/return?locale=en&session_id={CHECKOUT_SESSION_ID}");
    expect(input.cancelUrl).toBe("https://dashboard.vamostaxi.site/bookings/VT-26-0001");
  });

  it("staffExtraPayUrl returns the open kind=extra hosted URL for this booking only", async () => {
    sqlHandler = () => [{ booking_id: BOOKING, extra_session_id: "cs_test_extra1" }];
    const extra = { id: "cs_test_extra1", status: "open", url: "https://checkout.stripe.test/c/pay/cs_test_extra1", metadata: { kind: "extra", booking_id: BOOKING } };
    retrieve.mockResolvedValue(extra);
    expect(await staffExtraPayUrl(env, "VT-26-0001")).toEqual({ ok: true, bookingId: BOOKING, url: extra.url });
    retrieve.mockResolvedValue({ ...extra, metadata: { kind: "extra", booking_id: "other" } });
    expect(await staffExtraPayUrl(env, "VT-26-0001")).toEqual({ ok: false, code: "session-expired" });
    retrieve.mockResolvedValue({ ...extra, metadata: {} });
    expect(await staffExtraPayUrl(env, "VT-26-0001")).toEqual({ ok: false, code: "session-expired" });
    retrieve.mockResolvedValue({ ...extra, status: "expired" });
    expect(await staffExtraPayUrl(env, "VT-26-0001")).toEqual({ ok: false, code: "session-expired" });
  });

  it("staffExtraPayUrl says no-session when the edit has no extra payment", async () => {
    sqlHandler = () => [{ booking_id: BOOKING, extra_session_id: null }];
    expect(await staffExtraPayUrl(env, "VT-26-0001")).toEqual({ ok: false, code: "no-session" });
    sqlHandler = () => [];
    expect(await staffExtraPayUrl(env, "nope")).toEqual({ ok: false, code: "not-found" });
  });
});
