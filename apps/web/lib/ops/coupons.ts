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

function mapCouponRow(row: CouponSqlRow): CouponRow {
  return {
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
  };
}

export type DcCoupon = {
  id: string;
  code: string;
  kind: CouponKind;
  value: string;
  uses: number;
  limit: number;
  expires: string;
  active: boolean;
  note: string;
};

function dateOnly(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "00" || trimmed === "0" || trimmed.toUpperCase() === "NULL";
}

function expiresToIso(expires: string): string | null {
  const trimmed = expires.trim();
  if (!trimmed || trimmed.startsWith("0000")) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new CouponInputError("coupons-window");
  }
  return `${trimmed}T00:00:00.000Z`;
}

/** DC table row. Amount kind always ships value "00" — no CHF discount. */
export function toDcCoupon(row: CouponRow): DcCoupon {
  return {
    id: String(row.id),
    code: row.code,
    kind: row.kind,
    value: row.kind === "percent" && row.percent != null ? String(row.percent) : "00",
    uses: 0,
    limit: row.globalLimit ?? 0,
    expires: dateOnly(row.validUntil),
    active: row.active,
    note: row.note,
  };
}

/** Map OpsCoupons / VamosOps.coupons fields onto CouponInput. Amount never becomes rappen. */
export function couponInputFromDc(raw: unknown): CouponInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CouponInputError("coupons-error");
  }
  const body = raw as Record<string, unknown>;
  const kind: CouponKind = body.kind === "amount" ? "amount" : "percent";
  const value = body.value == null ? "" : String(body.value);
  const limitRaw = body.limit == null || body.limit === "" ? 0 : Number(body.limit);
  if (!Number.isFinite(limitRaw)) throw new CouponInputError("coupons-limit-integer");
  const expires = typeof body.expires === "string" ? body.expires : "";

  let percent: number | null = null;
  if (kind === "percent" && !isPlaceholderValue(value)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new CouponInputError("coupons-percent-range");
    percent = parsed;
  }

  return {
    code: typeof body.code === "string" ? body.code : "",
    kind,
    percent,
    amountRappen: null,
    validFrom: null,
    validUntil: expiresToIso(expires),
    globalLimit: limitRaw === 0 ? null : limitRaw,
    perUserLimit: null,
    active: body.active !== false,
    note: typeof body.note === "string" ? body.note : "",
  };
}

export function couponIdFromRequest(request: Request): number | null {
  const pathname = new URL(request.url).pathname;
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  const id = Number(last);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
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
    return rows.map(mapCouponRow);
  });
}

export async function insertCoupon(
  env: CloudflareEnv,
  claims: VamosClaims,
  input: CouponInput,
): Promise<CouponRow> {
  const parsed = assertCouponInput(input);
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<CouponSqlRow[]>`
      insert into public.coupons (
        code, kind, percent, amount_rappen,
        valid_from, valid_until, global_limit, per_user_limit, active, note
      ) values (
        ${parsed.code},
        ${parsed.kind},
        ${parsed.percent},
        ${parsed.amountRappen},
        ${parsed.validFrom},
        ${parsed.validUntil},
        ${parsed.globalLimit},
        ${parsed.perUserLimit},
        ${parsed.active},
        ${parsed.note}
      )
      returning
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
    `;
    const row = rows[0];
    if (!row) throw new CouponInputError("coupons-error");
    return mapCouponRow(row);
  });
}

export async function updateCouponRecord(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: number,
  input: CouponInput,
): Promise<CouponRow | null> {
  if (!Number.isInteger(id) || id < 1) throw new CouponInputError("coupons-error");
  const parsed = assertCouponInput(input);
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<CouponSqlRow[]>`
      update public.coupons set
        code = ${parsed.code},
        kind = ${parsed.kind},
        percent = ${parsed.percent},
        amount_rappen = ${parsed.amountRappen},
        valid_from = ${parsed.validFrom},
        valid_until = ${parsed.validUntil},
        global_limit = ${parsed.globalLimit},
        per_user_limit = ${parsed.perUserLimit},
        active = ${parsed.active},
        note = ${parsed.note}
      where id = ${id}
      returning
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
    `;
    const row = rows[0];
    return row ? mapCouponRow(row) : null;
  });
}

export async function setCouponActiveRecord(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: number,
  active: boolean,
): Promise<CouponRow | null> {
  if (!Number.isInteger(id) || id < 1) throw new CouponInputError("coupons-error");
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<CouponSqlRow[]>`
      update public.coupons set active = ${active} where id = ${id}
      returning
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
    `;
    const row = rows[0];
    return row ? mapCouponRow(row) : null;
  });
}

export async function deleteCouponRecord(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: number,
): Promise<boolean> {
  if (!Number.isInteger(id) || id < 1) throw new CouponInputError("coupons-error");
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: number }[]>`
      delete from public.coupons where id = ${id} returning id
    `;
    return rows.length > 0;
  });
}
