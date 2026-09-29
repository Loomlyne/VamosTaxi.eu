import { describe, expect, it, vi } from "vitest";

// D-36: a customer time change stores the Europe/Zurich instant.
const captured: { payload: string | null } = { payload: null };

vi.mock("@/lib/db/identity", () => {
  // Tagged-template fake: returns rows per query text.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("from public.bookings b")) return Promise.resolve([{ id: "b-1" }]);
    if (text.includes("booking_edit_clone_quote_snapshot")) return Promise.resolve([{ id: 7 }]);
    if (text.includes("booking_edit_request_upsert")) {
      captured.payload = String(values.find((v) => typeof v === "string" && v.startsWith("{")) ?? "");
      return Promise.resolve([{ request_id: "r-1", superseded_id: null }]);
    }
    return Promise.resolve([]);
  };
  const run = async (_env: unknown, ...rest: unknown[]) => {
    const fn = rest[rest.length - 1] as (s: unknown) => unknown;
    return fn(sql);
  };
  return { asCustomer: run, asGuest: run, asSystem: run };
});

vi.mock("@/lib/lifecycle/notify-lifecycle", () => ({ notifyFlightNumber: vi.fn(), notifyTimeChange: vi.fn() }));
vi.mock("@/lib/checkout/stripe", () => ({
  createCheckoutSession: vi.fn(),
  createRefund: vi.fn(),
  expireCheckoutSession: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
  hostedSessionIsPayable: vi.fn(),
  stripeFromEnv: vi.fn(),
}));
vi.mock("@/lib/quote/lock", () => ({ verifyLock: vi.fn() }));

import { requestCustomerTimeChange } from "./edit-request";

const env = {} as CloudflareEnv;
const auth = { kind: "guest", manageTokenHashHex: "aa" } as never;

describe("requestCustomerTimeChange Zurich instant", () => {
  it("stores 08:00 Zurich (CEST) as 06:00Z and ignores a client instant", async () => {
    const result = await requestCustomerTimeChange(env, auth, "VT-1", {
      scheduledLocal: "2026-10-01T08:00",
      scheduledAt: "2026-10-01T08:00",
    });
    expect(result.ok).toBe(true);
    const payload = JSON.parse(captured.payload ?? "{}");
    expect(payload.scheduled_local).toBe("2026-10-01T08:00");
    expect(payload.scheduled_at).toBe("2026-10-01T06:00:00.000Z");
  });

  it("winter time is UTC+1", async () => {
    await requestCustomerTimeChange(env, auth, "VT-1", { scheduledLocal: "2026-12-01T08:00" });
    expect(JSON.parse(captured.payload ?? "{}").scheduled_at).toBe("2026-12-01T07:00:00.000Z");
  });

  it("refuses a text that is not a wall clock", async () => {
    const result = await requestCustomerTimeChange(env, auth, "VT-1", { scheduledLocal: "tomorrow" });
    expect(result).toEqual({ ok: false, code: "not-found" });
  });
});
