// apps/web/app/[locale]/(ops)/api/staff/settings/route.ts
//
// GET  /api/staff/settings — singleton, the live settings_versions row, and the
//      unpublished policy draft.
// PATCH /api/staff/settings — UPDATEs public.settings and the policy draft. Never
//      writes settings_versions: the four policy values go live through
//      POST /api/staff/settings/policy-publish (owner, 2026-10-02 — D-27 reversed for
//      those four, see the header of lib/ops/settings.ts). Dual-mounted at
//      app/api/staff/settings.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertPolicyDraftInput,
  assertSettingsInput,
  loadCurrentPolicyVersion,
  loadPolicyDraft,
  loadSettings,
  mapSqlState,
  policyDraftChanges,
  policyDraftOrLive,
  POLICY_DRAFT_FIELDS,
  SettingsInputError,
  type PolicyDraftField,
  type PolicyDraftInput,
  type PolicyDraftRow,
  type PolicyVersionRow,
  type SettingsInput,
  type SettingsRow,
} from "@/lib/ops/settings";
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

/**
 * DC field names. The four policy boxes hold the **draft** — what he is editing.
 * `live*` is what customers get right now, so the page can show both and name the
 * difference before he publishes.
 */
function toDcSettings(
  settings: SettingsRow,
  policy: PolicyVersionRow | null,
  draft: PolicyDraftRow | null,
) {
  const shown = policyDraftOrLive(draft, policy);
  const changes = policyDraftChanges(shown, policy);
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
    minAdvance: shown.min_advance_minutes ?? "",
    cancelWindow: shown.free_cancel_hours ?? "",
    airportWait: shown.airport_waiting_minutes ?? "",
    cityWait: shown.city_waiting_minutes ?? "",
    liveMinAdvance: policy?.min_advance_minutes ?? "",
    liveCancelWindow: policy?.free_cancel_hours ?? "",
    liveAirportWait: policy?.airport_waiting_minutes ?? "",
    liveCityWait: policy?.city_waiting_minutes ?? "",
    policyChanges: changes.map((c) => ({ field: c.field, from: c.from ?? "", to: c.to ?? "" })),
    policyDirty: changes.length > 0,
    policySlug: policy?.slug ?? "",
    policyLabel: policy?.label ?? "",
    policyEffectiveFrom: policy?.effective_from ?? "",
  };
}

/**
 * The four policy numbers off the request body. An empty box is null ("not set yet"),
 * not zero — zero is a real answer here and would quietly promise no waiting time.
 */
function parsePolicyDraftBody(raw: unknown, current: PolicyDraftInput | null): PolicyDraftInput {
  const body = (raw ?? {}) as Record<string, unknown>;
  const dcNames: Record<PolicyDraftField, string> = {
    min_advance_minutes: "minAdvance",
    free_cancel_hours: "cancelWindow",
    airport_waiting_minutes: "airportWait",
    city_waiting_minutes: "cityWait",
  };
  const out = {} as PolicyDraftInput;
  for (const field of POLICY_DRAFT_FIELDS) {
    const sent = body[field] ?? body[dcNames[field]];
    if (sent === undefined) {
      out[field] = current ? current[field] : null;
      continue;
    }
    if (sent === null || sent === "") {
      out[field] = null;
      continue;
    }
    if (typeof sent === "number") {
      out[field] = sent;
      continue;
    }
    if (typeof sent === "string") {
      const trimmed = sent.trim();
      // Number("") is 0 and Number("12abc") is NaN — both must be refusals, not writes.
      const parsed = trimmed === "" ? null : Number(trimmed);
      if (parsed !== null && !Number.isFinite(parsed)) {
        throw new SettingsInputError(field, "settings-error-policy-number");
      }
      out[field] = parsed;
      continue;
    }
    throw new SettingsInputError(field, "settings-error-policy-number");
  }
  return assertPolicyDraftInput(out);
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
    vat_rate_bps: current.vat_rate_bps,
  });
}

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const settings = await loadSettings(env, claims);
  const policy = await loadCurrentPolicyVersion(env, claims);
  const draft = await loadPolicyDraft(env, claims);
  return jsonOk(toDcSettings(settings, policy, draft));
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
  // The fallback for a field the page did not send is what it is showing — draft, or live
  // where the draft has nothing yet. Falling back to a bare null would blank a value he
  // never touched.
  const currentDraft = policyDraftOrLive(
    await loadPolicyDraft(env, claims),
    await loadCurrentPolicyVersion(env, claims),
  );

  let parsed: SettingsInput;
  let parsedDraft: PolicyDraftInput;
  try {
    parsed = parseSettingsBody(raw, current);
    parsedDraft = parsePolicyDraftBody(raw, currentDraft);
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
          updated_at = now()
        where id = 1
      `;
      // The draft rides the same Save, so the page never ends up with the company
      // address saved and the waiting time not. Still a draft: no customer sees it
      // until Publish.
      // An upsert, not an update: a plain UPDATE on a missing row changes nothing and
      // reports success, which is how a Save button comes to lie.
      await sql`
        insert into public.settings_policy_draft (
          id, min_advance_minutes, free_cancel_hours,
          airport_waiting_minutes, city_waiting_minutes, updated_at, updated_by
        ) values (
          1, ${parsedDraft.min_advance_minutes}, ${parsedDraft.free_cancel_hours},
          ${parsedDraft.airport_waiting_minutes}, ${parsedDraft.city_waiting_minutes},
          now(), ${claims.sub}
        )
        on conflict (id) do update set
          min_advance_minutes = excluded.min_advance_minutes,
          free_cancel_hours = excluded.free_cancel_hours,
          airport_waiting_minutes = excluded.airport_waiting_minutes,
          city_waiting_minutes = excluded.city_waiting_minutes,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
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
  const draft = await loadPolicyDraft(env, claims);
  return jsonOk(toDcSettings(settings, policy, draft));
});
