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
  couponTableStatus,
  couponUseAmounts,
  loadCouponRedemptions,
  loadCoupons,
  toDcCoupon,
  usesForCoupon,
  validFromOnCreate,
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

  it("uses the unreleased redemption count, not a hardcoded 10", async () => {
    let calls = 0;
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = async () => {
        calls += 1;
        if (calls === 1) {
          return [{
            id: 7,
            code: "FULL",
            kind: "percent",
            percent: "10.00",
            amount_rappen: null,
            valid_from: null,
            valid_until: null,
            global_limit: 4,
            per_user_limit: null,
            active: true,
            note: "",
            created_at: "2026-08-01T00:00:00.000Z",
          }];
        }
        return [{ coupon_id: 7, code: "FULL", version_status: "live", uses: 4 }];
      };
      return fn(sql);
    });

    const rows = await loadCoupons(env, claims);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.uses).toBe(4);
    const dc = toDcCoupon(rows[0]!);
    expect(dc.cap).toBe(4);
    expect(couponTableStatus({ active: dc.active, uses: dc.uses, limit: dc.cap })).toBe("used");
    expect(couponTableStatus({ active: dc.active, uses: dc.uses, limit: dc.cap })).not.toBe("live");
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
    expect(dc.limit).toBe(1);
  });

  it("keeps a real redemption count instead of a hardcoded zero", () => {
    const dc = toDcCoupon({
      id: 9,
      code: "WELCOME",
      kind: "percent",
      percent: 10,
      amountRappen: null,
      validFrom: null,
      validUntil: null,
      globalLimit: 10,
      perUserLimit: null,
      active: true,
      note: "",
      createdAt: "2026-08-01T00:00:00.000Z",
      uses: 10,
    });
    expect(dc.uses).toBe(10);
    expect(dc.limit).toBe(10);
    expect(dc.cap).toBe(10);
    expect(couponTableStatus({ active: dc.active, uses: dc.uses, limit: dc.cap })).toBe("used");
    expect(couponTableStatus({ active: true, uses: dc.uses, limit: dc.cap })).not.toBe("live");
  });

  it("stays live when uses are still under the cap, and does not treat 10 as magic", () => {
    expect(couponTableStatus({ active: true, uses: 9, limit: 10 })).toBe("live");
    expect(couponTableStatus({ active: true, uses: 3, limit: 3 })).toBe("used");
    expect(couponTableStatus({ active: true, uses: 4, limit: null })).toBe("live");
    expect(usesForCoupon({ id: 9 }, [
      { couponId: 9, code: "WELCOME", versionStatus: "live", uses: 3 },
      { couponId: 2, code: "OTHER", versionStatus: "live", uses: 10 },
    ])).toBe(3);
    expect(usesForCoupon({ id: 9 }, [])).toBe(0);
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
    expect(dc.validFrom).toBe("");
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
      limit: 1,
      expires: "",
      active: true,
      note: "",
    });
    expect(input.amountRappen).toBe(2500);
    expect(input.percent).toBeNull();
    expect(input.globalLimit).toBe(1);
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

  it("leaves validFrom null when the operator does not send Starts", () => {
    const input = couponInputFromDc({ code: "SAVE10", kind: "percent", value: "10", expires: "" });
    expect(input.validFrom).toBeNull();
  });

  it("maps 1/2/10/21/100 onto globalLimit and rejects 0", () => {
    for (const n of [1, 2, 10, 21, 100]) {
      expect(couponInputFromDc({ code: "CAP", kind: "percent", value: "10", limit: n }).globalLimit).toBe(n);
    }
    expect(couponInputFromDc({ code: "CAP", kind: "percent", value: "10" }).globalLimit).toBe(1);
    expect(() => couponInputFromDc({ code: "CAP", kind: "percent", value: "10", limit: 0 })).toThrow(CouponInputError);
  });

  it("maps a filled Add coupon form including a client UUID id", () => {
    const input = couponInputFromDc({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      code: "welcome",
      kind: "percent",
      value: "20",
      uses: 0,
      limit: 1,
      validFrom: "2026-09-22",
      expires: "2026-09-23",
      active: true,
      note: "",
    });
    expect(input.code).toBe("welcome");
    expect(input.kind).toBe("percent");
    expect(input.percent).toBe(20);
    expect(input.amountRappen).toBeNull();
    expect(input.validFrom).toBe("2026-09-22T00:00:00.000Z");
    expect(input.validUntil).toBe("2026-09-23T00:00:00.000Z");
    expect(input.globalLimit).toBe(1);
    expect(input.active).toBe(true);
    expect(assertCouponInput(input).code).toBe("WELCOME");
  });
});

describe("validFromOnCreate", () => {
  it("defaults missing validFrom to the Zurich creation day", () => {
    // 22:00 UTC on 22 Sep 2026 is 00:00 the next day in Zurich (CEST).
    expect(validFromOnCreate(null, new Date("2026-09-22T22:00:00.000Z"))).toBe(
      "2026-09-23T00:00:00.000Z",
    );
  });

  it("keeps a supplied validFrom", () => {
    expect(validFromOnCreate("2026-08-01T00:00:00.000Z")).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("couponIdFromRequest", () => {
  it("reads the last path segment", () => {
    expect(couponIdFromRequest(new Request("http://vamos.test/api/staff/coupons/12"))).toBe(12);
    expect(couponIdFromRequest(new Request("http://vamos.test/api/staff/coupons/cp-x"))).toBeNull();
    expect(
      couponIdFromRequest(
        new Request("http://vamos.test/api/staff/coupons/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
      ),
    ).toBeNull();
  });
});

describe("loadCouponRedemptions", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("returns only captured, unreleased uses", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = Object.assign(
        async () => [
          {
            coupon_id: 2,
            code: "SAVE10",
            redeemed_at: "2026-09-14T10:00:00.000Z",
            booking_id: "11111111-1111-4111-8111-111111111111",
            reference: "VT-1001",
            email: "guest@example.test",
            subtotal_rappen: 10000,
            surcharges_rappen: 2000,
            discount_rappen: 1200,
            total_rappen: 10800,
          },
        ],
        { raw: async () => [] },
      );
      return fn(sql);
    });

    await expect(loadCouponRedemptions(env, claims)).resolves.toEqual([
      {
        couponId: 2,
        code: "SAVE10",
        redeemedAt: "2026-09-14T10:00:00.000Z",
        bookingId: "11111111-1111-4111-8111-111111111111",
        reference: "VT-1001",
        email: "guest@example.test",
        beforeRappen: 12000,
        afterRappen: 10800,
      },
    ]);
  });

  it("leaves before/after null when snapshot columns are missing", async () => {
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = Object.assign(
        async () => [
          {
            coupon_id: 2,
            code: "SAVE10",
            redeemed_at: "2026-09-14T10:00:00.000Z",
            booking_id: "11111111-1111-4111-8111-111111111111",
            reference: "VT-1001",
            email: null,
            subtotal_rappen: null,
            surcharges_rappen: null,
            discount_rappen: null,
            total_rappen: null,
          },
        ],
        { raw: async () => [] },
      );
      return fn(sql);
    });

    await expect(loadCouponRedemptions(env, claims)).resolves.toEqual([
      {
        couponId: 2,
        code: "SAVE10",
        redeemedAt: "2026-09-14T10:00:00.000Z",
        bookingId: "11111111-1111-4111-8111-111111111111",
        reference: "VT-1001",
        email: "",
        beforeRappen: null,
        afterRappen: null,
      },
    ]);
  });
});

describe("couponUseAmounts", () => {
  it("does not invent a before figure when the stored identity is broken", () => {
    expect(
      couponUseAmounts({
        subtotal_rappen: 10000,
        surcharges_rappen: 2000,
        discount_rappen: 500,
        total_rappen: 10800,
      }),
    ).toEqual({ beforeRappen: null, afterRappen: 10800 });
  });
});
