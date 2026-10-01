// apps/web/lib/checkout/customer-resend.test.ts
//
// 26.2 P6, D19: the customer's "Resend email" sends the confirmation again (a fresh manage link) to
// the booking's own address, for the booking the visitor may see (manage token or signed-in owner).

import { beforeEach, describe, expect, it, vi } from "vitest";

const asCustomer = vi.fn();
const asGuest = vi.fn();
const deliver = vi.fn();
vi.mock("@/lib/db/identity", () => ({
  asCustomer: (...a: unknown[]) => asCustomer(...a),
  asGuest: (...a: unknown[]) => asGuest(...a),
  asSystem: vi.fn(),
  asStaff: vi.fn(),
}));
vi.mock("@/lib/ops/voucher", () => ({ deliverBookingConfirmation: (...a: unknown[]) => deliver(...a) }));

import { resendCustomerConfirmation } from "./customer-resend";

const env = {} as CloudflareEnv;
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
    expect(await resendCustomerConfirmation(env, { kind: "customer", claims }, "VT-26-0801")).toEqual({ ok: true, bookingId: "b1", email: "anna@example.test" });
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
