// apps/web/lib/checkout/customer-resend.test.ts
//
// 26.2 P6, D19: the customer's "Resend email" sends the confirmation again (a fresh manage link) to
// the booking's own address, for the booking the visitor may see (manage token or signed-in owner).

import { beforeEach, describe, expect, it, vi } from "vitest";

const asCustomer = vi.fn();
const asGuest = vi.fn();
const asSystem = vi.fn();
const deliver = vi.fn();
const sendCancellation = vi.fn();
vi.mock("@/lib/db/identity", () => ({
  asCustomer: (...a: unknown[]) => asCustomer(...a),
  asGuest: (...a: unknown[]) => asGuest(...a),
  asSystem: (...a: unknown[]) => asSystem(...a),
  asStaff: vi.fn(),
}));
vi.mock("@/lib/ops/voucher", () => ({ deliverBookingConfirmation: (...a: unknown[]) => deliver(...a) }));
vi.mock("@vamos/emails/confirmation", () => ({ sendCancellation: (...a: unknown[]) => sendCancellation(...a) }));

import { resendCustomerConfirmation } from "./customer-resend";

const env = { RESEND_API_KEY: "re_test" } as CloudflareEnv;
const claims = { sub: "u1", email: "anna@example.test" } as never;

function seen(rows: unknown[]) {
  const calls: string[] = [];
  const fn = async (_e: unknown, _id: unknown, cb: (sql: unknown) => unknown) =>
    cb((strings: TemplateStringsArray) => {
      calls.push(strings.join("?"));
      return Promise.resolve(rows);
    });
  return { fn, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resendCustomerConfirmation (D19)", () => {
  it("the signed-in owner: the confirmation goes again to the booking's address", async () => {
    const s = seen([{ id: "b1", status: "confirmed" }]);
    asCustomer.mockImplementation(s.fn);
    deliver.mockResolvedValue({ ok: true, email: "anna@example.test" });
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-26-0801")).toEqual({ ok: true, bookingId: "b1", email: "anna@example.test", mail: "confirmation" });
    expect(deliver).toHaveBeenCalledWith(env, "b1");
    // The customer's own read never names a column the customer role cannot read.
    expect(s.calls.join(" ")).not.toMatch(/erased_at/);
  });

  it("the manage-link visitor (guest token)", async () => {
    asGuest.mockImplementation(seen([{ id: "b2", status: "assigned" }]).fn);
    deliver.mockResolvedValue({ ok: true, email: "ben@example.test" });
    expect(await resendCustomerConfirmation(env, { kind: "guest", manageTokenHashHex: "ab" }, "VT-26-0802")).toMatchObject({ ok: true, email: "ben@example.test" });
  });

  it("nothing for a booking the visitor cannot see, an unpaid one, or a failed send", async () => {
    asCustomer.mockImplementation(seen([]).fn);
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-x")).toEqual({ ok: false, code: "not-found" });
    asCustomer.mockImplementation(seen([{ id: "b3", status: "pending" }]).fn);
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-y")).toEqual({ ok: false, code: "not-found" });
    asCustomer.mockImplementation(seen([{ id: "b4", status: "confirmed" }]).fn);
    deliver.mockResolvedValue({ ok: false, code: "email-failed" });
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-z")).toEqual({ ok: false, code: "not-sent" });
    expect(await resendCustomerConfirmation(env, { kind: "guest", manageTokenHashHex: "" }, "VT-z")).toEqual({ ok: false, code: "not-found" });
  });
});

describe("resendCustomerConfirmation on a cancelled trip (D20: the cancellation e-mail again)", () => {
  const facts = (over: Record<string, unknown> = {}) => ({
    reference: "VT-26-0809", locale: "de", contact_email: "anna@example.test",
    pickup_text: "Zurich Oerlikon", dropoff_text: "Zurich Airport", scheduled_local: "2030-01-01T10:00",
    refund_mode: "pending_ops", refund_rappen: null, ...over,
  });
  function system(rows: unknown[]) {
    const calls: string[] = [];
    asSystem.mockImplementation(async (_e: unknown, cb: (sql: unknown) => unknown) =>
      cb((strings: TemplateStringsArray) => {
        calls.push(strings.join("?"));
        return Promise.resolve(rows);
      }));
    return calls;
  }

  it("sends the cancellation e-mail to the booking's address with the refund line it recorded, never the 'Booked' mail", async () => {
    asCustomer.mockImplementation(seen([{ id: "c1", status: "cancelled" }]).fn);
    const calls = system([facts()]);
    sendCancellation.mockResolvedValue({ ok: true, providerMessageId: "m1" });
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-26-0809")).toEqual({
      ok: true, bookingId: "c1", email: "anna@example.test", mail: "cancellation",
    });
    expect(deliver).not.toHaveBeenCalled();
    expect(calls.join(" ")).toMatch(/public\.booking_cancel_resend_facts\(/);
    expect(sendCancellation).toHaveBeenCalledTimes(1);
    expect(sendCancellation).toHaveBeenCalledWith(
      { RESEND_API_KEY: "re_test" },
      { reference: "VT-26-0809", locale: "de", pickupText: "Zurich Oerlikon", dropoffText: "Zurich Airport",
        scheduledLocal: "2030-01-01T10:00", refundLine: "pending_ops", urgent: false },
      "anna@example.test",
    );
  });

  it("the refund line follows the cancellation, as finishPaidCancel chose it", async () => {
    asGuest.mockImplementation(seen([{ id: "c2", status: "refunded" }]).fn);
    sendCancellation.mockResolvedValue({ ok: true, providerMessageId: "m2" });
    const lineFor = async (over: Record<string, unknown>) => {
      sendCancellation.mockClear();
      system([facts(over)]);
      await resendCustomerConfirmation(env, { kind: "guest", manageTokenHashHex: "ab" }, "VT-26-0810");
      return (sendCancellation.mock.calls[0]?.[1] as { refundLine?: string } | undefined)?.refundLine;
    };
    expect(await lineFor({ refund_mode: "auto_full", refund_rappen: 5000 })).toBe("full_captured");
    expect(await lineFor({ refund_mode: "auto_full", refund_rappen: 0 })).toBe("none");
    expect(await lineFor({ refund_mode: "none", refund_rappen: null })).toBe("none");
    expect(await lineFor({ refund_mode: null, refund_rappen: null })).toBe("none");
    expect(await lineFor({ locale: "xx" })).toBe("pending_ops");
    expect((sendCancellation.mock.calls[0]?.[1] as { locale: string }).locale).toBe("en");
  });

  it("partially cancelled counts as cancelled", async () => {
    asCustomer.mockImplementation(seen([{ id: "c3", status: "partially_cancelled" }]).fn);
    system([facts()]);
    sendCancellation.mockResolvedValue({ ok: true, providerMessageId: "m3" });
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-x")).toMatchObject({ ok: true, mail: "cancellation" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("a trip cancelled before it was paid, no address, no mail key or a failed send: nothing claims to be sent", async () => {
    asCustomer.mockImplementation(seen([{ id: "c4", status: "cancelled" }]).fn);
    system([]);
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-x")).toEqual({ ok: false, code: "not-found" });
    system([facts({ contact_email: "" })]);
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-x")).toEqual({ ok: false, code: "not-sent" });
    system([facts()]);
    expect(await resendCustomerConfirmation({} as CloudflareEnv, { kind: "customer", claims }, "VT-x")).toEqual({ ok: false, code: "not-sent" });
    sendCancellation.mockResolvedValue({ ok: false, error: "resend 500" });
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-x")).toEqual({ ok: false, code: "not-sent" });
    expect(deliver).not.toHaveBeenCalled();
  });
});
