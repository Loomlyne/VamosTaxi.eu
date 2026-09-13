// apps/web/lib/ops/settings.ts
//
// D-27: this module never writes public.settings_versions. Publishing a new
// policy version is a migration, not a console action — the function does not
// exist, so a later contributor adding one is crossing a decision rather than
// filling a gap.
//
// 06-07's shared mapSqlState (lib/ops/sqlstate.ts) is not on this fork (Wave 4
// parallel). The local mapper below covers 23514 (column CHECK) and 23001
// (tg_append_only restrict_violation) by err.code only, never message text.

import { asStaff, type VamosClaims } from "../db/identity";

const LOCALES = ["en", "de", "fr", "ar"] as const;
const CURRENCIES = ["CHF", "EUR", "USD", "AED"] as const;
const UID_SHAPE = /^CHE-\d{3}\.\d{3}\.\d{3}$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SettingsLocale = (typeof LOCALES)[number];
export type SettingsCurrency = (typeof CURRENCIES)[number];

export type SettingsRow = {
  id: 1;
  company: string;
  address: string;
  uid_number: string;
  phone: string;
  email: string;
  default_lang: SettingsLocale;
  default_currency: SettingsCurrency;
  accepts_cash: boolean;
  accepts_card: boolean;
  accepts_twint: boolean;
  accepts_invoice: boolean;
  email_confirmation: boolean;
  email_reminder: boolean;
  sms_reminder: boolean;
  ops_alerts: boolean;
  chauffeur_turnaround_minutes: number;
  vat_rate_bps: number;
  updated_at: string;
};

export type SettingsInput = {
  company: string;
  address: string;
  uid_number: string;
  phone: string;
  email: string;
  default_lang: SettingsLocale;
  default_currency: SettingsCurrency;
  accepts_cash: boolean;
  accepts_card: boolean;
  accepts_twint: boolean;
  accepts_invoice: boolean;
  email_confirmation: boolean;
  email_reminder: boolean;
  sms_reminder: boolean;
  ops_alerts: boolean;
  chauffeur_turnaround_minutes: number;
  vat_rate_bps: number;
};

export type CancellationTier =
  | { kind: "window"; fromHoursBefore: number; refundPercent: number }
  | { kind: "no_show"; refundPercent: number }
  | { kind: "unknown"; raw: unknown };

export type PolicyVersionRow = {
  id: number;
  slug: string;
  label: string;
  effective_from: string;
  created_by: string | null;
  free_cancel_hours: number | null;
  modification_deadline_hours: number | null;
  min_advance_minutes: number | null;
  airport_waiting_minutes: number | null;
  city_waiting_minutes: number | null;
  manage_link_validity_days: number | null;
  round_trip_discount_percent: number | null;
  night_window_start: string | null;
  night_window_end: string | null;
  night_window_tz: string;
  quote_lock_minutes: number | null;
  checkout_window_minutes: number | null;
  cancellation_tiers: CancellationTier[];
  policy_doc_slug: string | null;
  policy_doc_version: string | null;
};

export class SettingsInputError extends Error {
  readonly field: string;
  readonly copyId: string;

  constructor(field: string, copyId: string) {
    super(copyId);
    this.name = "SettingsInputError";
    this.field = field;
    this.copyId = copyId;
  }
}

export type OpsDbFailure =
  | { kind: "check"; copyId: "check-constraint" }
  | { kind: "append-only"; copyId: "settings-error-append-only" }
  | { kind: "privilege"; copyId: "insufficient-privilege" }
  | { kind: "unknown" };

/** Branch on SQLSTATE only. 23514 = column CHECK; 23001 = append-only raise. */
export function mapSqlState(err: unknown): OpsDbFailure {
  const code = (err as { code?: string } | null)?.code;
  if (code === "23514") return { kind: "check", copyId: "check-constraint" };
  if (code === "23001") return { kind: "append-only", copyId: "settings-error-append-only" };
  if (code === "42501") return { kind: "privilege", copyId: "insufficient-privilege" };
  return { kind: "unknown" };
}

type SettingsSql = {
  id: number;
  company: string;
  address: string;
  uid_number: string;
  phone: string;
  email: string;
  default_lang: string;
  default_currency: string;
  accepts_cash: boolean;
  accepts_card: boolean;
  accepts_twint: boolean;
  accepts_invoice: boolean;
  email_confirmation: boolean;
  email_reminder: boolean;
  sms_reminder: boolean;
  ops_alerts: boolean;
  chauffeur_turnaround_minutes: number;
  vat_rate_bps: number;
  updated_at: Date | string;
};

type PolicySql = {
  id: number | string;
  slug: string;
  label: string;
  effective_from: Date | string;
  created_by: string | null;
  free_cancel_hours: number | null;
  modification_deadline_hours: number | null;
  min_advance_minutes: number | null;
  airport_waiting_minutes: number | null;
  city_waiting_minutes: number | null;
  manage_link_validity_days: number | null;
  round_trip_discount_percent: number | string | null;
  night_window_start: string | null;
  night_window_end: string | null;
  night_window_tz: string;
  quote_lock_minutes: number | null;
  checkout_window_minutes: number | null;
  cancellation_tiers: unknown;
  policy_doc_slug: string | null;
  policy_doc_version: string | null;
};

function isLocale(value: string): value is SettingsLocale {
  return (LOCALES as readonly string[]).includes(value);
}

function isCurrency(value: string): value is SettingsCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (isFiniteNumber(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function requiredNumber(value: unknown, label: string): number {
  const parsed = nullableNumber(value);
  if (parsed === null) throw new Error(label);
  return parsed;
}

function asIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function asTime(value: string | null): string | null {
  if (value === null) return null;
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function parseTier(element: unknown): CancellationTier {
  if (element && typeof element === "object") {
    const rec = element as Record<string, unknown>;
    const refund = nullableNumber(rec.refund_percent);
    if (rec.no_show === true && refund !== null) {
      return { kind: "no_show", refundPercent: refund };
    }
    const fromHours = nullableNumber(rec.from_hours_before);
    if (fromHours !== null && refund !== null) {
      return { kind: "window", fromHoursBefore: fromHours, refundPercent: refund };
    }
  }
  return { kind: "unknown", raw: element };
}

function parseTiers(value: unknown): CancellationTier[] {
  if (!Array.isArray(value)) return [{ kind: "unknown", raw: value }];
  const parsed = value.map(parseTier);
  const windows = parsed
    .filter((tier): tier is Extract<CancellationTier, { kind: "window" }> => tier.kind === "window")
    .sort((a, b) => b.fromHoursBefore - a.fromHoursBefore);
  const noShows = parsed.filter((tier) => tier.kind === "no_show");
  const unknowns = parsed.filter((tier) => tier.kind === "unknown");
  return [...windows, ...noShows, ...unknowns];
}

function mapPolicy(row: PolicySql): PolicyVersionRow {
  return {
    id: requiredNumber(row.id, "policy-id"),
    slug: row.slug,
    label: row.label,
    effective_from: asIso(row.effective_from),
    created_by: row.created_by,
    free_cancel_hours: nullableNumber(row.free_cancel_hours),
    modification_deadline_hours: nullableNumber(row.modification_deadline_hours),
    min_advance_minutes: nullableNumber(row.min_advance_minutes),
    airport_waiting_minutes: nullableNumber(row.airport_waiting_minutes),
    city_waiting_minutes: nullableNumber(row.city_waiting_minutes),
    manage_link_validity_days: nullableNumber(row.manage_link_validity_days),
    round_trip_discount_percent: nullableNumber(row.round_trip_discount_percent),
    night_window_start: asTime(row.night_window_start),
    night_window_end: asTime(row.night_window_end),
    night_window_tz: row.night_window_tz,
    quote_lock_minutes: nullableNumber(row.quote_lock_minutes),
    checkout_window_minutes: nullableNumber(row.checkout_window_minutes),
    cancellation_tiers: parseTiers(row.cancellation_tiers),
    policy_doc_slug: row.policy_doc_slug,
    policy_doc_version: row.policy_doc_version,
  };
}

function mapSettings(row: SettingsSql): SettingsRow {
  if (row.id !== 1) throw new Error("settings-singleton");
  if (!isLocale(row.default_lang)) throw new Error("settings-lang");
  if (!isCurrency(row.default_currency)) throw new Error("settings-currency");
  return {
    id: 1,
    company: row.company,
    address: row.address,
    uid_number: row.uid_number,
    phone: row.phone,
    email: row.email,
    default_lang: row.default_lang,
    default_currency: row.default_currency,
    accepts_cash: row.accepts_cash === true,
    accepts_card: row.accepts_card === true,
    accepts_twint: row.accepts_twint === true,
    accepts_invoice: row.accepts_invoice === true,
    email_confirmation: row.email_confirmation === true,
    email_reminder: row.email_reminder === true,
    sms_reminder: row.sms_reminder === true,
    ops_alerts: row.ops_alerts === true,
    chauffeur_turnaround_minutes: requiredNumber(
      row.chauffeur_turnaround_minutes,
      "settings-turnaround",
    ),
    vat_rate_bps: requiredNumber(row.vat_rate_bps, "settings-vat"),
    updated_at: asIso(row.updated_at),
  };
}

export function assertSettingsInput(input: SettingsInput): SettingsInput {
  if (!isLocale(input.default_lang)) {
    throw new SettingsInputError("default_lang", "settings-error-lang");
  }
  if (!isCurrency(input.default_currency)) {
    throw new SettingsInputError("default_currency", "settings-error-currency");
  }
  if (
    !Number.isInteger(input.chauffeur_turnaround_minutes) ||
    input.chauffeur_turnaround_minutes < 0
  ) {
    throw new SettingsInputError("chauffeur_turnaround_minutes", "settings-error-turnaround");
  }
  if (!Number.isInteger(input.vat_rate_bps) || input.vat_rate_bps < 0) {
    throw new SettingsInputError("vat_rate_bps", "settings-error-vat");
  }

  const company = input.company.trim();
  const address = input.address.trim();
  const uid_number = input.uid_number.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();

  if (email !== "" && !EMAIL_SHAPE.test(email)) {
    throw new SettingsInputError("email", "settings-error-email");
  }
  if (uid_number !== "" && !UID_SHAPE.test(uid_number)) {
    throw new SettingsInputError("uid_number", "settings-error-uid");
  }

  return {
    ...input,
    company,
    address,
    uid_number,
    phone,
    email,
  };
}

export async function loadSettings(env: CloudflareEnv, claims: VamosClaims): Promise<SettingsRow> {
  const row = await asStaff(env, claims, async (sql) => {
    const rows = await sql<SettingsSql[]>`
      select
        id, company, address, uid_number, phone, email,
        default_lang, default_currency,
        accepts_cash, accepts_card, accepts_twint, accepts_invoice,
        email_confirmation, email_reminder, sms_reminder, ops_alerts,
        chauffeur_turnaround_minutes, vat_rate_bps, updated_at
      from public.settings
      where id = 1
    `;
    return rows[0] ?? null;
  });
  if (!row) throw new Error("settings-missing");
  return mapSettings(row);
}

export async function loadCurrentPolicyVersion(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<PolicyVersionRow | null> {
  const row = await asStaff(env, claims, async (sql) => {
    const rows = await sql<PolicySql[]>`
      select
        id, slug, label, effective_from, created_by,
        free_cancel_hours, modification_deadline_hours, min_advance_minutes,
        airport_waiting_minutes, city_waiting_minutes, manage_link_validity_days,
        round_trip_discount_percent, night_window_start, night_window_end, night_window_tz,
        quote_lock_minutes, checkout_window_minutes, cancellation_tiers,
        policy_doc_slug, policy_doc_version
      from public.settings_versions
      where effective_from <= now()
      order by effective_from desc
      limit 1
    `;
    return rows[0] ?? null;
  });
  return row ? mapPolicy(row) : null;
}

export async function loadPolicyHistory(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<PolicyVersionRow[]> {
  const rows = await asStaff(env, claims, async (sql) => {
    return sql<PolicySql[]>`
      select
        id, slug, label, effective_from, created_by,
        free_cancel_hours, modification_deadline_hours, min_advance_minutes,
        airport_waiting_minutes, city_waiting_minutes, manage_link_validity_days,
        round_trip_discount_percent, night_window_start, night_window_end, night_window_tz,
        quote_lock_minutes, checkout_window_minutes, cancellation_tiers,
        policy_doc_slug, policy_doc_version
      from public.settings_versions
      order by effective_from desc
    `;
  });
  return rows.map(mapPolicy);
}
