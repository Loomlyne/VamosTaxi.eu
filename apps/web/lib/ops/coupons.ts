// apps/web/lib/ops/coupons.ts
//
// Staff reader and kind-discriminated validator for public.coupons.
// Mirrors coupons_kind_field and coupons_window so the form fails fast;
// the named CHECKs remain the real gate.

import { asStaff, type VamosClaims } from "../db/identity";
import { mapSqlState } from "./sqlstate";

export { mapSqlState };

export type CouponKind = "percent" | "amount";

export type CouponRow = {
  id: number;
  code: string;
  kind: CouponKind;
  percent: number | null;
  amountRappen: number | null;
  validFrom: string | null;
  validUntil: string | null;
  globalLimit: number | null;
  perUserLimit: number | null;
  active: boolean;
  note: string;
  createdAt: string;
};

export type CouponInput = {
  code?: string;
  kind?: CouponKind;
  percent?: number | null;
  amountRappen?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  globalLimit?: number | null;
  perUserLimit?: number | null;
  active?: boolean;
  note?: string;
};

type CouponBase = {
  code: string;
  validFrom: string | null;
  validUntil: string | null;
  globalLimit: number | null;
  perUserLimit: number | null;
  active: boolean;
  note: string;
};

export type AssertedCouponInput =
  | (CouponBase & { kind: "percent"; percent: number | null; amountRappen: null })
  | (CouponBase & { kind: "amount"; percent: null; amountRappen: number | null });

export class CouponInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "CouponInputError";
    this.key = key;
  }
}

type CouponSqlRow = {
  id: number;
  code: string;
  kind: CouponKind;
  percent: string | number | null;
  amount_rappen: number | null;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  global_limit: number | null;
  per_user_limit: number | null;
  active: boolean;
  note: string;
  created_at: Date | string;
};

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toNumberOrNull(value: string | number | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalLimit(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new CouponInputError("coupons-limit-integer");
  }
  return value;
}

function atMostTwoDecimals(value: number): boolean {
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-8;
}

export function assertCouponInput(input: CouponInput): AssertedCouponInput {
  const code = (input.code ?? "").trim().toUpperCase();
  if (!code) throw new CouponInputError("coupons-code-required");

  const kind: CouponKind = input.kind === "amount" ? "amount" : "percent";
  const percent = input.percent ?? null;
  const amountRappen = input.amountRappen ?? null;

  if (kind === "percent" && amountRappen != null) {
    throw new CouponInputError("coupons-kind-exclusive");
  }
  if (kind === "amount" && percent != null) {
    throw new CouponInputError("coupons-kind-exclusive");
  }
  if (percent != null && amountRappen != null) {
    throw new CouponInputError("coupons-kind-exclusive");
  }

  if (percent != null) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new CouponInputError("coupons-percent-range");
    }
    if (!atMostTwoDecimals(percent)) {
      throw new CouponInputError("coupons-percent-decimals");
    }
  }

  if (amountRappen != null) {
    if (!Number.isInteger(amountRappen) || amountRappen < 0) {
      throw new CouponInputError("coupons-rappen-integer");
    }
  }

  const validFrom = input.validFrom ? input.validFrom : null;
  const validUntil = input.validUntil ? input.validUntil : null;
  if (validFrom && validUntil && validUntil <= validFrom) {
    throw new CouponInputError("coupons-window");
  }

  const base: CouponBase = {
    code,
    validFrom,
    validUntil,
    globalLimit: optionalLimit(input.globalLimit),
    perUserLimit: optionalLimit(input.perUserLimit),
    active: input.active !== false,
    note: input.note ?? "",
  };

  if (kind === "amount") {
    return { ...base, kind, percent: null, amountRappen };
  }
  return { ...base, kind, percent, amountRappen: null };
}

export async function loadCoupons(env: CloudflareEnv, claims: VamosClaims): Promise<CouponRow[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<CouponSqlRow[]>`
      select
        id,
        code,
        kind,
        percent,
        amount_rappen,
        valid_from,
        valid_until,
        global_limit,
        per_user_limit,
        active,
        note,
        created_at
      from public.coupons
      order by active desc, created_at desc
    `;
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      kind: row.kind,
      percent: toNumberOrNull(row.percent),
      amountRappen: row.amount_rappen,
      validFrom: toIso(row.valid_from),
      validUntil: toIso(row.valid_until),
      globalLimit: row.global_limit,
      perUserLimit: row.per_user_limit,
      active: row.active,
      note: row.note,
      createdAt: toIso(row.created_at) ?? "",
    }));
  });
}
