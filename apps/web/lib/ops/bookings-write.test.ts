import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapBoardBooking, type SqlBoardRow } from "./bookings-map";
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

// 26.0: a cold import of bookings-write takes 4-6 s; vitest's 5 s default timed the first test out.
describe("bookings-write arrival clock (D-38)", { timeout: 15_000 }, () => {
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
});

describe("cancelBooking expires open Stripe Checkout Sessions (D-04)", { timeout: 15_000 }, () => {
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

describe("cancelBooking on an unpaid booking expires its open Stripe Checkout Sessions (26.2-bp B1)", { timeout: 15_000 }, () => {
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
  const BOOKING_ID = "00000000-0000-4000-8000-000000000002";

  /** No captured payment, the erase update returns the row, the system read returns the session ids. */
  function mockUnpaidErase(sessionIds: string[] | Error): string[] {
    const systemSql: string[] = [];
    asStaff.mockImplementation(async (_env: CloudflareEnv, _claims: unknown, fn: (sql: unknown) => unknown) => {
      const sql = async (strings: TemplateStringsArray) => {
        const text = strings.join("?");
        if (text.includes("erased_at = now()")) return [{ id: BOOKING_ID }];
        return [];
      };
      return fn(sql);
    });
    asSystem.mockImplementation(async (_env: CloudflareEnv, fn: (sql: unknown) => unknown) => {
      const sql = async (strings: TemplateStringsArray) => {
        systemSql.push(strings.join("?"));
        if (sessionIds instanceof Error) throw sessionIds;
        return [{ ids: sessionIds }];
      };
      return fn(sql);
    });
    return systemSql;
  }

  it("erases the booking and expires every Stripe session it owns", async () => {
    const systemSql = mockUnpaidErase(["cs_1", "cs_2"]);
    expireCheckoutSession.mockResolvedValue({});
    const { cancelBooking } = await import("./bookings-write");

    const result = await cancelBooking(ENV, CLAIMS, BOOKING_ID);

    expect(result).toMatchObject({ ok: true, erased: true });
    expect(expireCheckoutSession).toHaveBeenCalledTimes(2);
    expect(expireCheckoutSession).toHaveBeenNthCalledWith(1, expect.anything(), "cs_1");
    expect(expireCheckoutSession).toHaveBeenNthCalledWith(2, expect.anything(), "cs_2");
    expect(systemSql.join("\n")).toMatch(/public\.checkout_booking_session_ids\(/);
  });

  it("a Stripe expire failure is logged and the erase still stands", async () => {
    mockUnpaidErase(["cs_1"]);
    expireCheckoutSession.mockRejectedValue(new Error("stripe_down"));
    const { cancelBooking } = await import("./bookings-write");

    const result = await cancelBooking(ENV, CLAIMS, BOOKING_ID);

    expect(result).toMatchObject({ ok: true, erased: true });
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("a failed read of the session ids is logged and the erase still stands", async () => {
    mockUnpaidErase(new Error("db_down"));
    const { cancelBooking } = await import("./bookings-write");

    const result = await cancelBooking(ENV, CLAIMS, BOOKING_ID);

    expect(result).toMatchObject({ ok: true, erased: true });
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });

  it("never calls Stripe on the legacy UAE test publishable key", async () => {
    mockUnpaidErase(["cs_1"]);
    const legacyEnv = {
      STRIPE_SECRET_KEY: "sk_test_bw",
      STRIPE_PUBLISHABLE_KEY: "pk_test_51U65pWlegacy",
    } as CloudflareEnv;
    const { cancelBooking } = await import("./bookings-write");

    const result = await cancelBooking(legacyEnv, CLAIMS, BOOKING_ID);

    expect(result).toMatchObject({ ok: true, erased: true });
    expect(stripeFromEnv).not.toHaveBeenCalled();
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });
});

describe("updateBooking never changes the class in place (26.2 P1, A8)", { timeout: 15_000 }, () => {
  const ENV = {} as CloudflareEnv;
  const CLAIMS = { sub: "staff-1", role: "authenticated" } as VamosClaims;
  const BOOKING_ID = "00000000-0000-4000-8000-000000000002";

  it("the in-place PATCH writes no vehicle class, whatever it is sent", async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    asStaff.mockReset();
    asStaff.mockImplementation(async (_env: CloudflareEnv, _claims: unknown, fn: (sql: unknown) => unknown) => {
      const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ text: strings.join("?"), values });
        if (calls.length === 1) return [{ id: BOOKING_ID }];
        if (calls.length === 2) return [{ id: 1 }];
        return [];
      };
      return fn(sql);
    });
    const { updateBooking } = await import("./bookings-write");
    const result = await updateBooking(ENV, CLAIMS, "VT-2", { klass: "Business" } as never);
    expect(result).toEqual({ ok: true });
    expect(calls.some((c) => c.text.includes("vehicle_class_id"))).toBe(false);
  });

  it("the PATCH route and the write no longer read a class", () => {
    const write = readFileSync(join(here, "bookings-write.ts"), "utf8");
    const route = readFileSync(join(here, "../../app/[locale]/(ops)/api/staff/bookings/[id]/route.ts"), "utf8");
    expect(write).not.toMatch(/klass/);
    expect(write).not.toMatch(/liveClassSlug/);
    expect(route).not.toMatch(/record\.klass/);
  });
});

describe("detail read model carries refund review and dispute facts (D-07, D-24, D-25)", { timeout: 15_000 }, () => {
  const base: SqlBoardRow = {
    id: "22222222-2222-2222-2222-222222222222",
    reference: "VT-26-0808",
    status: "cancelled",
    contact_name: "Ada",
    contact_email: "ada@example.com",
    contact_phone: null,
    company_name: null,
    note: null,
    pay_link_sent_at: null,
    pickup_text: "Zurich Airport (ZRH)",
    dropoff_text: "Zurich city",
    scheduled_local: "2026-09-24T15:50",
    scheduled_at: "2026-09-24T15:50:00+00",
    flight_no: null,
    pax: 1,
    bags: 0,
    class_slug: "economy",
    chauffeur_name: null,
    payment_status: "succeeded",
    captured_at: "2026-09-20T10:00:00.000Z",
    payment_created_at: "2026-09-20T09:59:00.000Z",
    stripe_checkout_session_id: "cs_test_1",
    charged_rappen: 12000,
  };

  it("maps a pending_ops booking with the captured amount and no owed amount yet", () => {
    const row = mapBoardBooking({
      ...base,
      refund_status: "pending_ops",
      refund_owed_rappen: null,
      captured_rappen: 12000,
      trip_passed: false,
      dispute_status: null,
      dispute_reason: null,
    });
    expect(row.refundStatus).toBe("pending_ops");
    expect(row.capturedRappen).toBe(12000);
    expect(row.refundOwedRappen).toBeNull();
    expect(row.tripPassed).toBe(false);
    expect(row.dispute).toBeNull();
  });

  it("maps a completed paid booking as trip passed", () => {
    const row = mapBoardBooking({
      ...base,
      status: "completed",
      refund_status: "none",
      refund_owed_rappen: null,
      captured_rappen: "12000",
      trip_passed: true,
    });
    expect(row.tripPassed).toBe(true);
    expect(row.refundStatus).toBe("none");
    expect(row.paid).toBe(true);
  });

  it("maps a dispute row to status and reason; none maps to null", () => {
    const row = mapBoardBooking({
      ...base,
      status: "completed",
      dispute_status: "needs_response",
      dispute_reason: "fraudulent",
    });
    expect(row.dispute).toEqual({ status: "needs_response", reason: "fraudulent" });
    const plain = mapBoardBooking(base);
    expect(plain.dispute).toBeNull();
    expect(plain.refundStatus).toBe("none");
    expect(plain.tripPassed).toBe(false);
    expect(plain.refundOwedRappen).toBeNull();
  });

  it("keeps an owed amount once the admin has decided", () => {
    const row = mapBoardBooking({ ...base, refund_status: "refunded", refund_owed_rappen: 4800 });
    expect(row.refundOwedRappen).toBe(4800);
  });

  it("reads the facts from SQL: refund columns, trip passed at now(), latest dispute", () => {
    const src = read("bookings.ts");
    expect(src).toMatch(/b\.refund_status/);
    expect(src).toMatch(/b\.refund_owed_rappen/);
    expect(src).toMatch(/min\(bl\.original_scheduled_at\) <= now\(\)/);
    expect(src).toMatch(/from public\.booking_disputes/);
    expect(src).toMatch(/order by d\.stripe_created desc/);
  });
});
