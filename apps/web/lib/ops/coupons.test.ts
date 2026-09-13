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

import {
  assertCouponInput,
  couponIdFromRequest,
  couponInputFromDc,
  CouponInputError,
  loadCoupons,
  toDcCoupon,
} from "./coupons";

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

describe("toDcCoupon", () => {
  it("ships amount value as CHF from rappen", () => {
    const dc = toDcCoupon({
      id: 3,
      code: "TEST",
      kind: "amount",
      percent: null,
      amountRappen: 5000,
      validFrom: null,
      validUntil: null,
      globalLimit: null,
      perUserLimit: null,
      active: true,
      note: "",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    expect(dc.value).toBe("50");
    expect(dc.uses).toBe(0);
    expect(dc.limit).toBe(0);
  });

  it("ships NULL percent as 00", () => {
    const dc = toDcCoupon({
      id: 4,
      code: "OPEN",
      kind: "percent",
      percent: null,
      amountRappen: null,
      validFrom: null,
      validUntil: "2026-12-31T00:00:00.000Z",
      globalLimit: 10,
      perUserLimit: null,
      active: false,
      note: "",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    expect(dc.value).toBe("00");
    expect(dc.expires).toBe("2026-12-31");
    expect(dc.limit).toBe(10);
    expect(dc.active).toBe(false);
  });
});

describe("couponInputFromDc", () => {
  it("maps amount-off value to rappen (D-34)", () => {
    const input = couponInputFromDc({
      code: "TEST",
      kind: "amount",
      value: "25.00",
      limit: 0,
      expires: "",
      active: true,
      note: "",
    });
    expect(input.amountRappen).toBe(2500);
    expect(input.percent).toBeNull();
    expect(input.globalLimit).toBeNull();
  });

  it("accepts amountRappen directly", () => {
    const input = couponInputFromDc({
      code: "save10",
      kind: "amount",
      amountRappen: 5000,
    });
    expect(input.amountRappen).toBe(5000);
    expect(input.code).toBe("save10");
  });

  it("trims the code (D-34)", () => {
    expect(couponInputFromDc({ code: "  save10  ", kind: "percent", value: "10" }).code).toBe(
      "save10",
    );
  });

  it("treats 00 / NULL as unpriced percent", () => {
    expect(couponInputFromDc({ code: "OPEN", kind: "percent", value: "00" }).percent).toBeNull();
    expect(couponInputFromDc({ code: "OPEN", kind: "percent", value: "NULL" }).percent).toBeNull();
  });
});

describe("couponIdFromRequest", () => {
  it("reads the last path segment", () => {
    expect(couponIdFromRequest(new Request("http://vamos.test/api/staff/coupons/12"))).toBe(12);
    expect(couponIdFromRequest(new Request("http://vamos.test/api/staff/coupons/cp-x"))).toBeNull();
  });
});
