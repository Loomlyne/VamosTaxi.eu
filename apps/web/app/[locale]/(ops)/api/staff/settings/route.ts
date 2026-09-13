// apps/web/app/[locale]/(ops)/api/staff/settings/route.ts
//
// GET  /api/staff/settings — singleton + current settings_versions row (read-only).
// PATCH /api/staff/settings — UPDATE public.settings only (D-27). Never writes
// settings_versions. Dual-mounted at app/api/staff/settings.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertSettingsInput,
  loadCurrentPolicyVersion,
  loadSettings,
  mapSqlState,
  SettingsInputError,
  type PolicyVersionRow,
  type SettingsInput,
  type SettingsRow,
} from "@/lib/ops/settings";
import { CH_VAT_RATE_BPS } from "@/lib/checkout/vat";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asTurnaround(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Integer >= 0. Missing → current then 81. Negative / non-finite → throw. */
function asVatBps(value: unknown, current: number): number {
  const fallback = Number.isInteger(current) && current >= 0 ? current : CH_VAT_RATE_BPS;
  if (value === undefined || value === null || value === "") return fallback;
  let parsed: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) parsed = value;
  else if (typeof value === "string" && value !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) parsed = n;
  }
  if (parsed === null || parsed < 0) {
    throw new SettingsInputError("vat_rate_bps", "settings-error-vat");
  }
  return Math.trunc(parsed);
}

/** DC field names. Policy numbers are display-only (D-27). */
function toDcSettings(settings: SettingsRow, policy: PolicyVersionRow | null) {
  return {
    company: settings.company,
    address: settings.address,
    uid: settings.uid_number,
    phone: settings.phone,
    email: settings.email,
    defaultLang: settings.default_lang,
    defaultCur: settings.default_currency,
    cash: settings.accepts_cash,
    card: settings.accepts_card,
    twint: settings.accepts_twint,
    invoice: settings.accepts_invoice,
    emailConfirm: settings.email_confirmation,
    emailReminder: settings.email_reminder,
    smsReminder: settings.sms_reminder,
    opsAlerts: settings.ops_alerts,
    chauffeurTurnaround: settings.chauffeur_turnaround_minutes,
    vatRateBps: settings.vat_rate_bps,
    minAdvance: policy?.min_advance_minutes ?? "",
    cancelWindow: policy?.free_cancel_hours ?? "",
    airportWait: policy?.airport_waiting_minutes ?? "",
    cityWait: policy?.city_waiting_minutes ?? "",
    policySlug: policy?.slug ?? "",
    policyLabel: policy?.label ?? "",
    policyEffectiveFrom: policy?.effective_from ?? "",
  };
}

function parseSettingsBody(raw: unknown, current: SettingsRow): SettingsInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SettingsInputError("body", "settings-error-input");
  }
  const body = raw as Record<string, unknown>;
  return assertSettingsInput({
    company: asString(body.company, current.company),
    address: asString(body.address, current.address),
    uid_number: asString(body.uid_number ?? body.uid, current.uid_number),
    phone: asString(body.phone, current.phone),
    email: asString(body.email, current.email),
    default_lang: asString(
      body.default_lang ?? body.defaultLang,
      current.default_lang,
    ) as SettingsInput["default_lang"],
    default_currency: asString(
      body.default_currency ?? body.defaultCur,
      current.default_currency,
    ) as SettingsInput["default_currency"],
    accepts_cash: asBool(body.accepts_cash ?? body.cash, current.accepts_cash),
    accepts_card: asBool(body.accepts_card ?? body.card, current.accepts_card),
    accepts_twint: asBool(body.accepts_twint ?? body.twint, current.accepts_twint),
    accepts_invoice: asBool(body.accepts_invoice ?? body.invoice, current.accepts_invoice),
    email_confirmation: asBool(
      body.email_confirmation ?? body.emailConfirm,
      current.email_confirmation,
    ),
    email_reminder: asBool(body.email_reminder ?? body.emailReminder, current.email_reminder),
    sms_reminder: asBool(body.sms_reminder ?? body.smsReminder, current.sms_reminder),
    ops_alerts: asBool(body.ops_alerts ?? body.opsAlerts, current.ops_alerts),
    chauffeur_turnaround_minutes: asTurnaround(
      body.chauffeur_turnaround_minutes ?? body.chauffeurTurnaround,
      current.chauffeur_turnaround_minutes,
    ),
    vat_rate_bps: asVatBps(
      body.vat_rate_bps ?? body.vatRateBps,
      current.vat_rate_bps,
    ),
  });
}

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const settings = await loadSettings(env, claims);
  const policy = await loadCurrentPolicyVersion(env, claims);
  return jsonOk(toDcSettings(settings, policy));
});

export const PATCH = withStaff(async (claims, request) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonErr("settings-error-input", 400);
  }

  const { env } = getCloudflareContext();
  const current = await loadSettings(env, claims);

  let parsed: SettingsInput;
  try {
    parsed = parseSettingsBody(raw, current);
  } catch (err) {
    if (err instanceof SettingsInputError) return jsonErr(err.copyId, 400);
    throw err;
  }

  try {
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.settings set
          company = ${parsed.company},
          address = ${parsed.address},
          uid_number = ${parsed.uid_number},
          phone = ${parsed.phone},
          email = ${parsed.email},
          default_lang = ${parsed.default_lang},
          default_currency = ${parsed.default_currency},
          accepts_cash = ${parsed.accepts_cash},
          accepts_card = ${parsed.accepts_card},
          accepts_twint = ${parsed.accepts_twint},
          accepts_invoice = ${parsed.accepts_invoice},
          email_confirmation = ${parsed.email_confirmation},
          email_reminder = ${parsed.email_reminder},
          sms_reminder = ${parsed.sms_reminder},
          ops_alerts = ${parsed.ops_alerts},
          chauffeur_turnaround_minutes = ${parsed.chauffeur_turnaround_minutes},
          vat_rate_bps = ${parsed.vat_rate_bps},
          updated_at = now()
        where id = 1
      `;
      return null;
    });
  } catch (err) {
    const mapped = mapSqlState(err);
    if (mapped.kind === "unknown") throw err;
    return jsonErr(mapped.copyId, mapped.kind === "privilege" ? 403 : 400);
  }

  const settings = await loadSettings(env, claims);
  const policy = await loadCurrentPolicyVersion(env, claims);
  return jsonOk(toDcSettings(settings, policy));
});
