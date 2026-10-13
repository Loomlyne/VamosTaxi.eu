// apps/web/lib/ops/edit-accept-retired-class.test.ts
//
// Phase 30 decision 8 (T-30-14d): Accept (`acceptPaidEdit`) on a customer edit request for a trip in a
// retired class, or a request naming a retired class, is refused with `unknown-class` (the dashboard's
// existing "Could not apply edit" line) before `booking_edit_request_accept` runs. Mock style of
// payment-changed.test.ts. Synthetic ids only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
const asSystem = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
  asSystem: (...args: unknown[]) => asSystem(...args),
  asCustomer: vi.fn(),
  asGuest: vi.fn(),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async (_env: unknown, _claims: unknown, key: string) => (key ? BOOKING : null),
}));
vi.mock("@/lib/checkout/manage-token", () => ({
  mintManageToken: vi.fn(async () => ({ raw: "manage-token-raw", hash: new Uint8Array([1, 2, 3]) })),
}));
vi.mock("../checkout/stripe", () => ({
  createRefund: vi.fn(),
  expireCheckoutSession: vi.fn(),
  findRefundByIntent: vi.fn(),
  resolvePaymentIntentId: vi.fn(),
  retrieveRefund: vi.fn(),
  stripeFromEnv: vi.fn(),
}));
vi.mock("./must-fix-mail", () => ({ deliverOverlapMustFix: vi.fn(async () => undefined) }));

import { acceptPaidEdit } from "./edit-request";

const BOOKING = "b0000000-0000-4000-8000-000000000030";
const REQUEST = "e0000000-0000-4000-8000-000000000030";
const env = {} as CloudflareEnv;
const claims: VamosClaims = {
  sub: "a0000000-0000-4000-8000-000000000030",
  role: "authenticated",
  app_metadata: { vamos_role: "admin" },
};

/** asSystem as postgres.js begin() runs it; the retired lookup answers `retired`. */
function system(retired: boolean) {
  const texts: string[] = [];
  asSystem.mockImplementation(async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      texts.push(text);
      if (text.includes("booking_edit_request_accept")) {
        return Promise.resolve([
          { request_id: REQUEST, booking_id: BOOKING, outcome: "applied", difference_rappen: 0, extra_snapshot_id: null, extra_session_id: null },
        ]);
      }
      return Promise.resolve([{ retired }]);
    };
    return fn(sql);
  });
  return texts;
}

beforeEach(() => {
  asStaff.mockReset();
  asSystem.mockReset();
});

describe("Accept on a trip in a retired class (decision 8)", () => {
  it("is refused with unknown-class and the accept function is never called", async () => {
    const texts = system(true);
    const result = await acceptPaidEdit(env, claims, "VT-26-0801", { requestId: REQUEST, payload: {} });
    expect(result).toEqual({ ok: false, code: "unknown-class" });
    expect(texts.some((t) => t.includes("booking_edit_request_accept"))).toBe(false);
    expect(texts.some((t) => t.includes("hidden_at is not null"))).toBe(true);
  });

  it("goes through when the class is not retired", async () => {
    const texts = system(false);
    const result = await acceptPaidEdit(env, claims, "VT-26-0801", { requestId: REQUEST, payload: {} });
    expect(result).toMatchObject({ ok: true, outcome: "applied" });
    expect(texts.some((t) => t.includes("booking_edit_request_accept"))).toBe(true);
  });
});
