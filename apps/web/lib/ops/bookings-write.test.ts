import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extraWaitFromArrival } from "./bookings-map";
import type { VamosClaims } from "../db/identity";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

const asStaff = vi.fn();
const asSystem = vi.fn();
const stripeFromEnv = vi.fn();
const expireCheckoutSession = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
  asSystem: (...args: unknown[]) => asSystem(...args),
}));

// bookings-write.ts also imports this via the "@/" alias, which vitest's
// plain resolver (no tsconfig-paths plugin, D-?? not this plan's scope)
// cannot resolve for a REAL dynamic import unless it is mocked with a bare
// factory (no importOriginal) — unused by the cancel path under test here.
vi.mock("@/lib/checkout/manage-token", () => ({
  mintManageToken: vi.fn(),
}));

vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: (...args: unknown[]) => stripeFromEnv(...args),
    expireCheckoutSession: (...args: unknown[]) => expireCheckoutSession(...args),
  };
});

describe("bookings-write arrival clock (D-38)", () => {
  it("persists booking_legs.arrived_at on markArrival and does not charge Stripe", () => {
    const src = read("bookings-write.ts");
    expect(src).toMatch(/export async function markArrival/);
    expect(src).toMatch(/arrived_at = coalesce\(arrived_at, now\(\)\)/);
    expect(src).not.toMatch(/off_session/);
    expect(src).not.toMatch(/PaymentIntent/);
    const route = readFileSync(
      join(here, "../../app/[locale]/(ops)/api/staff/bookings/[id]/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/markArrival/);
    expect(route).toMatch(/arrived === true/);
  });

  it("computes extra wait from published free_wait_minutes, not 60", () => {
    const wait = extraWaitFromArrival({
      arrivedAt: "2026-09-14T11:20:00.000Z",
      scheduledAt: "2026-09-14T10:00:00.000Z",
      freeWaitMinutes: 45,
      unitMinutes: 15,
      amountRappen: 1500,
    });
    expect(wait.extraMinutes).toBe(35);
    expect(wait.extraRappen).toBe(3 * 1500);
    const noFree = extraWaitFromArrival({
      arrivedAt: "2026-09-14T10:10:00.000Z",
      scheduledAt: "2026-09-14T10:00:00.000Z",
      freeWaitMinutes: null,
      amountRappen: 2000,
    });
    expect(noFree.extraMinutes).toBe(10);
    expect(noFree.extraRappen).toBe(2000);
    expect(wait.extraMinutes).not.toBe(60);
  });
});

describe("cancelBooking expires open Stripe Checkout Sessions (D-04)", () => {
  beforeEach(() => {
    asStaff.mockReset();
    asSystem.mockReset();
    stripeFromEnv.mockReset();
    expireCheckoutSession.mockReset();
    stripeFromEnv.mockReturnValue({});
  });

  const ENV = {
    STRIPE_SECRET_KEY: "sk_test_bw",
    STRIPE_PUBLISHABLE_KEY: "pk_test_normal",
  } as CloudflareEnv;
  const CLAIMS = { sub: "staff-1", role: "authenticated" } as VamosClaims;
  const BOOKING_ID = "00000000-0000-4000-8000-000000000001";

  function mockPaidThenOpsCancel(sessionIds: string[]) {
    asStaff.mockImplementation(async (_env: CloudflareEnv, _claims: unknown, fn: (sql: unknown) => unknown) => {
      const sql = async () => [{ id: 1 }];
      return fn(sql);
    });
    asSystem.mockImplementation(async (_env: CloudflareEnv, fn: (sql: unknown) => unknown) => {
      const sql = async () => [
        {
          booking_id: BOOKING_ID,
          reference: "VT-1",
          email: "a@example.test",
          name: "Ada",
          locale: "en",
          paid: true,
          refund_mode: "none",
          refund_rappen: 0,
          stripe_checkout_session_ids: sessionIds,
        },
      ];
      return fn(sql);
    });
  }

  it("expires every session id ops_cancel_booking returns after the cancel commits", async () => {
    mockPaidThenOpsCancel(["cs_1", "cs_2"]);
    expireCheckoutSession.mockResolvedValue({});
    const { cancelBooking } = await import("./bookings-write");

    const result = await cancelBooking(ENV, CLAIMS, BOOKING_ID);

    expect(result.ok).toBe(true);
    expect(expireCheckoutSession).toHaveBeenCalledTimes(2);
    expect(expireCheckoutSession).toHaveBeenNthCalledWith(1, expect.anything(), "cs_1");
    expect(expireCheckoutSession).toHaveBeenNthCalledWith(2, expect.anything(), "cs_2");
  });

  it("a Stripe expire failure is logged and the cancel still stands", async () => {
    mockPaidThenOpsCancel(["cs_1"]);
    expireCheckoutSession.mockRejectedValue(new Error("stripe_down"));
    const { cancelBooking } = await import("./bookings-write");

    const result = await cancelBooking(ENV, CLAIMS, BOOKING_ID);

    expect(result.ok).toBe(true);
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("never calls Stripe on the legacy UAE test publishable key", async () => {
    mockPaidThenOpsCancel(["cs_1"]);
    const legacyEnv = {
      STRIPE_SECRET_KEY: "sk_test_bw",
      STRIPE_PUBLISHABLE_KEY: "pk_test_51U65pWlegacy",
    } as CloudflareEnv;
    const { cancelBooking } = await import("./bookings-write");

    const result = await cancelBooking(legacyEnv, CLAIMS, BOOKING_ID);

    expect(result.ok).toBe(true);
    expect(stripeFromEnv).not.toHaveBeenCalled();
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });
});
