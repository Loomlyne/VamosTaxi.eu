// apps/web/lib/ops/coupons.test.ts
//
// Kind-discrimination, rappen-integer, upper-case codes, window order, and
// the empty-seed reader. No Hyperdrive, no Docker.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "@/lib/db/identity";

const asStaff = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

import { assertCouponInput, CouponInputError, loadCoupons } from "./coupons";

const claims: VamosClaims = {
  sub: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "dispatcher" },
};

const env = {} as CloudflareEnv;

describe("assertCouponInput", () => {
  it("throws when percent and amount are both set", () => {
    expect(() =>
      assertCouponInput({ kind: "percent", percent: 10, amountRappen: 500 }),
    ).toThrow(CouponInputError);
  });

  it("throws when amount rappen is not an integer", () => {
    expect(() =>
      assertCouponInput({ kind: "amount", amountRappen: 12.5 }),
    ).toThrow(CouponInputError);
  });

  it("returns the code upper-cased", () => {
    const result = assertCouponInput({ code: "save10" });
    expect(result.code).toBe("SAVE10");
  });

  it("throws when validUntil is before validFrom", () => {
    expect(() =>
      assertCouponInput({
        code: "SAVE10",
        kind: "percent",
        percent: 10,
        validFrom: "2026-08-01T00:00:00.000Z",
        validUntil: "2026-07-01T00:00:00.000Z",
      }),
    ).toThrow(CouponInputError);
  });
});

describe("loadCoupons", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("returns an empty array against the seeded database and never throws on it", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = async () => [];
      return fn(sql);
    });

    await expect(loadCoupons(env, claims)).resolves.toEqual([]);
  });

  it("keeps a NULL amount as null, never zero", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = async () => [
        {
          id: 1,
          code: "SAVE10",
          kind: "percent",
          percent: "10.00",
          amount_rappen: null,
          valid_from: null,
          valid_until: null,
          global_limit: null,
          per_user_limit: null,
          active: true,
          note: "",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ];
      return fn(sql);
    });

    const rows = await loadCoupons(env, claims);
    expect(rows[0]?.amountRappen).toBeNull();
    expect(rows[0]?.percent).toBe(10);
  });
});
