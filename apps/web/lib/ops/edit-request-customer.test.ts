// apps/web/lib/ops/edit-request-customer.test.ts
//
// P6 review 1 (2026-10-02): a customer's change request is a time change at the booking's own price (D9).
// Before, the generic POST /api/account/bookings took a quote snapshot id, any public quote lock (its class
// total became the new price) and a free payload from the browser; the owner's one-click Accept then set
// "Refund due". Now the only customer door is the time change, the price record is the booking's own
// (cloned at its own total), and the database refuses anything else from a customer.

import { beforeEach, describe, expect, it, vi } from "vitest";

const systemCalls: { text: string; values: unknown[] }[] = [];
// What the upsert answers about the request it replaced (261002 finding 3 sets a page here).
let replacedPage: string | null = null;
const expireCheckoutSession = vi.fn();

vi.mock("@/lib/checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
  };
});

vi.mock("@/lib/db/identity", () => ({
  asGuest: async (_env: unknown, _hash: string, fn: (sql: unknown) => unknown) =>
    fn(async () => [{ id: "b1" }]),
  asCustomer: async (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) =>
    fn(async () => [{ id: "b1" }]),
  asSystem: async (_env: unknown, fn: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join("?");
        systemCalls.push({ text, values });
        if (text.includes("booking_edit_clone_quote_snapshot")) return [{ id: 41 }];
        if (text.includes("booking_edit_request_upsert")) {
          return [{
            request_id: "r1",
            superseded_id: replacedPage ? "r0" : null,
            old_extra_session_id: replacedPage,
            old_extra_snapshot_id: replacedPage ? 7 : null,
          }];
        }
        throw new Error(`unexpected system sql: ${text}`);
      },
      { json: (v: unknown) => ({ json: v }) },
    );
    return fn(sql);
  },
  asStaff: vi.fn(),
}));

beforeEach(() => {
  systemCalls.length = 0;
  replacedPage = null;
  expireCheckoutSession.mockReset();
});

describe("a customer's change request (review 1)", () => {
  it("is a time change at the booking's own price: the record is cloned at its own total, the payload holds the time only", async () => {
    const { requestCustomerTimeChange } = await import("./edit-request");
    const env = { QUOTE_LOCK_SECRET: "" } as CloudflareEnv;
    const r = await requestCustomerTimeChange(env, { kind: "guest", manageTokenHashHex: "ab" }, "VT-26-0101", {
      scheduledLocal: "2030-02-01T10:00",
    });
    expect(r).toEqual({ ok: true, requestId: "r1", bookingId: "b1", status: "requested" });
    const clone = systemCalls.find((c) => c.text.includes("booking_edit_clone_quote_snapshot"))!;
    expect(clone.values).toEqual(["b1", null, null]);
    const upsert = systemCalls.find((c) => c.text.includes("booking_edit_request_upsert"))!;
    // (booking, actor id, payload, price record): a guest has no actor id.
    expect(upsert.values).toEqual([
      "b1",
      null,
      { json: { scheduled_local: "2030-02-01T10:00", scheduled_at: "2030-02-01T09:00:00.000Z" } },
      41,
    ]);
    expect(upsert.text).toMatch(/'customer'/);
  });

  it("there is no customer door that takes a lock, a price record or other fields", async () => {
    const lib = await import("./edit-request");
    expect((lib as Record<string, unknown>).requestCustomerPaidEdit).toBeUndefined();
    const route = await import("../../app/api/account/bookings/route");
    expect((route as Record<string, unknown>).POST).toBeUndefined();
    expect(typeof route.GET).toBe("function");
  });

  it("the database's refusal of anything else from a customer has a name", async () => {
    const { mapEditSqlError, failStatus } = await import("./edit-request-map");
    expect(mapEditSqlError({ message: "customer-time-only" })).toEqual({ ok: false, code: "customer-time-only" });
    expect(mapEditSqlError({ message: "snapshot-mismatch" })).toEqual({ ok: false, code: "snapshot-mismatch" });
    expect(failStatus("customer-time-only")).toBe(400);
  });

  it("a staff change that waits for its difference refuses the request by name, as a conflict (409), whatever the message layout", async () => {
    const { mapEditSqlError, failStatus } = await import("./edit-request-map");
    const refused = { ok: false, code: "staff-change-waiting" };
    expect(mapEditSqlError({ message: "staff-change-waiting" })).toEqual(refused);
    expect(mapEditSqlError({ message: "staff-change-waiting\nCONTEXT: PL/pgSQL function" })).toEqual(refused);
    expect(mapEditSqlError({ message: "staff-change-waiting ", code: "P0001" })).toEqual(refused);
    expect(failStatus("staff-change-waiting")).toBe(409);
    // The neighbouring refusals keep their status and name.
    expect(failStatus("customer-time-only")).toBe(400);
    expect(failStatus("unpaid")).toBe(409);
    expect(mapEditSqlError({ message: "customer-time-only" })).toEqual({ ok: false, code: "customer-time-only" });
    // A name that only starts like it is not it.
    expect(mapEditSqlError({ message: "staff-change-waiting-x" })).toEqual({ ok: false, code: "unknown" });
  });

  it("261002 finding 3: the page of the request it replaced is closed best effort; a failure does not fail the request", async () => {
    const { requestCustomerTimeChange } = await import("./edit-request");
    const env = { QUOTE_LOCK_SECRET: "", STRIPE_SECRET_KEY: "sk_test_x" } as unknown as CloudflareEnv;
    const guest = { kind: "guest" as const, manageTokenHashHex: "ab" };
    const ok = { ok: true, requestId: "r1", bookingId: "b1", status: "requested" };

    replacedPage = "cs_test_replaced";
    expireCheckoutSession.mockResolvedValue({ status: "expired" });
    expect(await requestCustomerTimeChange(env, guest, "VT-26-0101", { scheduledLocal: "2030-02-01T10:00" })).toEqual(ok);
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(expireCheckoutSession.mock.calls[0]![1]).toBe("cs_test_replaced");

    // Stripe says no (already expired or paid): the customer's request still stands.
    expireCheckoutSession.mockReset();
    expireCheckoutSession.mockRejectedValue(new Error("This Checkout Session is not open"));
    expect(await requestCustomerTimeChange(env, guest, "VT-26-0101", { scheduledLocal: "2030-02-01T10:00" })).toEqual(ok);
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);

    // Nothing replaced, or no page on it: Stripe is not called.
    expireCheckoutSession.mockReset();
    replacedPage = null;
    expect(await requestCustomerTimeChange(env, guest, "VT-26-0101", { scheduledLocal: "2030-02-01T10:00" })).toEqual(ok);
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });

  it("the request path hands the refusal back as { ok: false, code } and the transaction around it is the database's to roll back", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/identity", () => ({
      asGuest: async (_env: unknown, _hash: string, fn: (sql: unknown) => unknown) =>
        fn(async () => [{ id: "b1" }]),
      asCustomer: async (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) =>
        fn(async () => [{ id: "b1" }]),
      asSystem: async (_env: unknown, fn: (sql: unknown) => unknown) => {
        const sql = Object.assign(
          async (strings: TemplateStringsArray) => {
            const text = strings.join("?");
            if (text.includes("booking_edit_clone_quote_snapshot")) return [{ id: 41 }];
            if (text.includes("booking_edit_request_upsert")) {
              throw Object.assign(new Error("staff-change-waiting"), { code: "P0001" });
            }
            throw new Error(`unexpected system sql: ${text}`);
          },
          { json: (v: unknown) => ({ json: v }) },
        );
        return fn(sql);
      },
      asStaff: vi.fn(),
    }));
    const { requestCustomerTimeChange } = await import("./edit-request");
    const r = await requestCustomerTimeChange(
      { QUOTE_LOCK_SECRET: "" } as CloudflareEnv,
      { kind: "guest", manageTokenHashHex: "ab" },
      "VT-26-0101",
      { scheduledLocal: "2030-02-01T10:00" },
    );
    expect(r).toEqual({ ok: false, code: "staff-change-waiting" });
    vi.doUnmock("@/lib/db/identity");
    vi.resetModules();
  });
});
