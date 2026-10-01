import { describe, expect, it, vi } from "vitest";

// D-36: a customer time change stores the Europe/Zurich instant.
// 26.2 P1: the payload goes to the database as a JSON parameter (sql.json), never as a
// `JSON.stringify(...)::jsonb` text — through the Worker's client that text arrives as a JSON
// string and booking_edit_requests refuses it (23514, proven on a real Postgres in
// packages/db/test/local/class-change-reprice.test.ts).
const captured: { payload: string | null; stringParams: number } = { payload: null, stringParams: 0 };

vi.mock("@/lib/db/identity", () => {
  // Tagged-template fake: returns rows per query text. sql.json marks a JSON parameter.
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("from public.bookings b")) return Promise.resolve([{ id: "b-1" }]);
      if (text.includes("booking_edit_clone_quote_snapshot")) return Promise.resolve([{ id: 7 }]);
      if (text.includes("booking_edit_request_upsert")) {
        const json = values.find((v) => v && typeof v === "object" && "__json" in (v as object)) as { __json: unknown } | undefined;
        captured.payload = json ? JSON.stringify(json.__json) : null;
        captured.stringParams = values.filter((v) => typeof v === "string" && v.startsWith("{")).length;
        return Promise.resolve([{ request_id: "r-1", superseded_id: null }]);
      }
      return Promise.resolve([]);
    },
    { json: (value: unknown) => ({ __json: value }) },
  );
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
    expect(captured.stringParams).toBe(0);
    expect(captured.payload).not.toBeNull();
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
