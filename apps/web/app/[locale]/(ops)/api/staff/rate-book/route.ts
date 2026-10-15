// apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
//
// GET  /api/staff/rate-book?versionId= — hydrate overlay collections.
// PUT  /api/staff/rate-book — upsert draft { kind: route|distance|surcharge|rule|coupon }. Kinds band and
//      region are invalid. Kind `rule` is a book setting on the draft rate_versions row, not a table:
//      ruleKind `vat` (vat_rate_bps) or `quote_lock` (quote_lock_minutes) only; anything else is 400.
//      Km bands, region % and the Rules list were removed (decision 2026-10-13 items 10, 13).
// DELETE /api/staff/rate-book — kinds route|distance|surcharge|coupon.
// Missing version → JSON 404. Unauthenticated → JSON 401. CHF only. No postgres.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { loadRateVersions } from "@/lib/ops/pricing";
import {
  assertDistanceRateInput,
  draftRowAvailable,
  assertFixedRouteInput,
  assertSurchargeInput,
  classifyPricingFailure,
  loadRateBook,
  loadServiceZones,
  pruneExtraLabels,
  RateBookInputError,
  forkLiveRateVersion,
  type DistanceRateInput,
  type DistanceRateRow,
  type FixedRouteInput,
  type FixedRouteRow,
  type RateBook,
  type ServiceZoneRow,
  type SurchargeInput,
  type SurchargeKind,
} from "@/lib/ops/rate-book";
import {
  EXTRA_LANGS,
  planExtraLabels,
  type AiLike,
  type ExtraLabelRow,
  type ExtraLang,
} from "@/lib/ops/extra-label-translate";
import {
  checkoutExtraKindFromRappen,
  isPlaceholderAmount,
  rappenFromMoneySet,
  rappenFromUnknown,
} from "@/lib/ops/rappen";
import { MANUAL_PREDICATE } from "@/lib/pricing/types";
import { QUOTE_LOCK_MINUTES } from "@/lib/quote/lock";
import { quoteLockMinutesFromWholeHours } from "@/lib/ops/quote-lock-hours";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";
import { asVehicleClassUuid, planVehicleClassWrite } from "@/lib/ops/vehicle-class-write";
import {
  CouponInputError,
  couponInputFromDc,
  insertCoupon,
  updateCouponRecord,
} from "@/lib/ops/coupons";
import {
  geoLanguageFromPath,
  mapboxIdFromPin,
  pgTextArrayLiteral,
  resolveZoneFromPin,
  type ZoneStore,
  type ZoneStoreRow,
} from "@/lib/ops/mapbox-zone";
import { retrieve, type GeoLanguage } from "@/lib/geo/mapbox";
import { countMapboxUnit } from "@/lib/abuse/breaker";

export const dynamic = "force-dynamic";

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRAFT_KINDS = ["route", "distance", "surcharge", "rule", "coupon"] as const;
type DraftKind = (typeof DRAFT_KINDS)[number];

function rec(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function optionalId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    return n > 0 ? n : null;
  }
  return null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

function moneyFromRappen(rappen: number | null): { CHF: string } {
  const chf = rappen == null ? "" : String(rappen / 100);
  return { CHF: chf };
}

/**
 * Kind `rule` is a book setting on the draft rate_versions row (decision 2026-10-13 item 13):
 * `vat` (vat_rate_bps) or `quote_lock` (quote_lock_minutes, whole hours 1 to 24; the 24-hour cap was
 * signed by the owner on 2026-10-15, see lib/ops/quote-lock-hours.ts). Any other ruleKind
 * (waiting, free_wait, service area, city pair, lock, …) and any refused value is null → 400.
 */
function parseRuleSetting(
  recBody: Record<string, unknown>,
): { kind: "vat"; bps: number } | { kind: "quote_lock"; minutes: number } | null {
  const ruleKindRaw =
    typeof recBody.ruleKind === "string"
      ? recBody.ruleKind
      : typeof recBody.rule === "string"
        ? recBody.rule
        : "";
  const ruleKind = ruleKindRaw.trim().toLowerCase().replace(/\s+/g, "_");
  const payloadObj = rec(recBody.payload) ?? recBody;
  if (ruleKind === "vat") {
    const bps = asInt(payloadObj.vat_rate_bps ?? recBody.vat_rate_bps);
    if (bps == null || bps < 0) return null;
    return { kind: "vat", bps };
  }
  if (ruleKind === "quote_lock") {
    const minutes = quoteLockMinutesFromWholeHours(
      recBody.quoteLockHours ?? recBody.quote_lock_hours ?? payloadObj.hours,
    );
    return minutes == null ? null : { kind: "quote_lock", minutes };
  }
  return null;
}

function mapboxIdOf(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  const obj = rec(value);
  if (!obj) return "";
  if (typeof obj.mapbox_id === "string" && obj.mapbox_id.trim() !== "") return obj.mapbox_id.trim();
  if (typeof obj.mapboxId === "string" && obj.mapboxId.trim() !== "") return obj.mapboxId.trim();
  return "";
}

function hasMapboxFromTo(body: Record<string, unknown>): boolean {
  const from =
    mapboxIdOf(body.fromMapbox) ||
    mapboxIdOf(body.from_mapbox_id) ||
    mapboxIdOf(body.originMapbox);
  const to =
    mapboxIdOf(body.toMapbox) ||
    mapboxIdOf(body.to_mapbox_id) ||
    mapboxIdOf(body.destMapbox);
  const originZone =
    typeof body.originZoneId === "string" && body.originZoneId.trim() !== ""
      ? body.originZoneId.trim()
      : "";
  const destZone =
    typeof body.destZoneId === "string" && body.destZoneId.trim() !== ""
      ? body.destZoneId.trim()
      : "";
  return (from !== "" || originZone !== "") && (to !== "" || destZone !== "");
}

function isDraftKind(value: unknown): value is DraftKind {
  return typeof value === "string" && (DRAFT_KINDS as readonly string[]).includes(value);
}

function percentFromUnknown(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (isPlaceholderAmount(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function klassSlug(value: unknown): string {
  const raw =
    typeof value === "string"
      ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : "";
  return CLASS_SLUG.test(raw) ? raw : "";
}

function klassLabel(slug: string): string {
  if (slug === "economy") return "Economy";
  if (slug === "business") return "Business";
  if (slug === "first") return "First";
  if (slug === "van") return "Van";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function zoneDisplay(zone: ServiceZoneRow): string {
  const name = zone.label && zone.label.length > 0 ? zone.label : zone.slug;
  if (zone.iata) return `${name} (${zone.iata})`;
  return name;
}

/**
 * D-10 (26.1-10): a Fixed-routes pick becomes the official zone it sits in — the city
 * (tag mapbox_place:<id>), the canton for a region pick (canton-<code>), or the airport for an
 * airport POI (tag mapbox:<id>) — never the street or point of interest itself. Mapbox
 * Search Box retrieve runs first with a server-minted session token in the staff locale; a
 * failed or unresolvable retrieve returns undefined and writes nothing (the caller answers
 * `mapbox`). Free-text matching against zone labels is gone: with canton names on file,
 * "Bahnhofstrasse 1, Zürich" would have matched the Zürich canton.
 */
async function ensureMapboxZone(
  env: CloudflareEnv,
  claims: VamosClaims,
  pin: unknown,
  language: GeoLanguage,
): Promise<ServiceZoneRow | undefined> {
  const resolved = await resolveZoneFromPin(pin, {
    retrieve: async (mapboxId) => {
      // D-37: Search Box /retrieve counts against the daily Mapbox budget like the quote path.
      await countMapboxUnit(env);
      const got = await retrieve({ mapboxId, sessionToken: crypto.randomUUID(), language }, env);
      return got.place;
    },
    withStore: (fn) =>
      asStaff(env, claims, async (tx) => {
        const store: ZoneStore = {
          async findActiveByTag(tag) {
            const rows = await tx<ZoneStoreRow[]>`
              select id, slug, iata, active, tags
                from public.service_zones
               where active and ${tag} = any(tags)
               order by slug
               limit 1
            `;
            return rows[0] ?? null;
          },
          async findBySlug(slug) {
            const rows = await tx<ZoneStoreRow[]>`
              select id, slug, iata, active, tags
                from public.service_zones
               where slug = ${slug}
            `;
            return rows[0] ?? null;
          },
          async tagAndActivate(id, tag) {
            const rows = await tx<ZoneStoreRow[]>`
              update public.service_zones
                 set active = true,
                     tags = case when ${tag} = any(tags) then tags else array_append(tags, ${tag}::text) end
               where id = ${id}
               returning id, slug, iata, active, tags
            `;
            return rows[0] ?? null;
          },
          async insert(target, slug) {
            const rows = await tx<ZoneStoreRow[]>`
              insert into public.service_zones (slug, iata, active, zone_type, tags)
              values (${slug}, null, true, ${target.zoneType}, ${pgTextArrayLiteral(target.tags)}::text[])
              on conflict (slug) do nothing
              returning id, slug, iata, active, tags
            `;
            const row = rows[0];
            if (!row) return null;
            // Proper names are non-translatable (ADR-012): the same string in every language.
            await tx`
              insert into public.content_strings (key, en, de, fr, ar, non_translatable)
              values (${`zone.${row.slug}`}, ${target.name}, ${target.name}, ${target.name}, ${target.name}, true)
              on conflict (key) do nothing
            `;
            return row;
          },
        };
        return fn(store);
      }),
  });
  if (!resolved.ok) return undefined;
  const zone = resolved.zone;
  return {
    id: zone.id,
    slug: zone.slug,
    iata: zone.iata,
    active: zone.active,
    label: resolved.target.name,
  };
}

function mockRoutes(book: RateBook, zones: ServiceZoneRow[]): Record<string, unknown>[] {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const groups = new Map<string, FixedRouteRow[]>();
  for (const row of book.fixedRoutes) {
    const key = `${row.originZoneId}::${row.destZoneId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out: Record<string, unknown>[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    if (!first) continue;
    const origin = zoneById.get(first.originZoneId);
    const dest = zoneById.get(first.destZoneId);
    const prices: Record<string, { CHF: string }> = {};
    for (const row of rows) {
      prices[row.vehicleClassSlug] = moneyFromRappen(row.priceRappen);
    }
    out.push({
      id: String(first.id),
      from: origin ? zoneDisplay(origin) : first.originSlug,
      to: dest ? zoneDisplay(dest) : first.destSlug,
      originZoneId: first.originZoneId,
      destZoneId: first.destZoneId,
      ...prices,
      prices,
      live: rows.some((r) => r.live),
    });
  }
  return out;
}

function mockRates(book: RateBook): Record<string, unknown>[] {
  const classById = new Map(book.vehicleClasses.map((c) => [c.id, c]));
  return book.distanceRates.map((row) => {
    const cls = classById.get(row.vehicleClassId);
    const name = (cls?.name && cls.name.trim()) || klassLabel(row.vehicleClassSlug);
    const photo = cls?.photoPath && !cls.photoPath.startsWith("data:") ? cls.photoPath : "";
    return {
      id: String(row.id),
      klass: name,
      name,
      vehicleClassId: row.vehicleClassId,
      vehicleClassSlug: row.vehicleClassSlug,
      baseFare: moneyFromRappen(row.baseFareRappen),
      perKm: moneyFromRappen(row.perKmRappen),
      minFare: moneyFromRappen(row.minFareRappen),
      airportStart: moneyFromRappen(row.airportStartRappen),
      maxPax: row.maxPax,
      maxBags: cls?.luggageCapacity ?? "",
      photo,
      photoPath: photo,
      sortOrder: cls?.sortOrder ?? 0,
      available: row.available,
      hideFromPublic: row.hideFromPublic || cls?.hiddenReason != null,
      hiddenReason: cls?.hiddenReason ?? "",
    };
  });
}

function mockSurcharges(book: RateBook): Record<string, unknown>[] {
  // 26.2-p4 A5 (owner, 2026-09-30): the code decides nothing on the Pricing table; every row is an extra.
  return book.surcharges.map((row) => {
    return {
      id: String(row.id),
      code: row.code,
      label: row.code,
      rule: row.appliesTo,
      kind: row.kind,
      amounts:
        row.kind === "included" && (row.amountRappen == null || row.amountRappen === 0)
          ? { CHF: "0" }
          : moneyFromRappen(row.amountRappen),
      pct: row.percent == null ? "" : String(row.percent),
      appliesTo: row.appliesTo,
      active: row.active,
    };
  });
}

function mockZones(zones: ServiceZoneRow[]): Record<string, unknown>[] {
  return zones.map((z) => ({
    id: z.id,
    slug: z.slug,
    iata: z.iata,
    active: z.active,
    label: zoneDisplay(z),
  }));
}

function bookPayload(book: RateBook, zones: ServiceZoneRow[]) {
  return {
    versionId: book.versionId,
    status: book.status,
    slug: book.slug,
    label: book.label,
    routes: mockRoutes(book, zones),
    rates: mockRates(book),
    surcharges: mockSurcharges(book),
    zones: mockZones(zones),
    classes: book.vehicleClasses
      .filter((c) => book.distanceRates.some((row) => row.vehicleClassId === c.id))
      .map((c) => ({
      id: c.id,
      slug: c.slug,
      label: (c.name && c.name.trim()) || klassLabel(c.slug),
      name: c.name || "",
      photoPath: c.photoPath || "",
      luggageCapacity: c.luggageCapacity ?? "",
      sortOrder: c.sortOrder ?? 0,
    })),
    vatRateBps: book.vatRateBps,
    // Decision 2026-10-13 item 13: never empty; a book without its own value shows the default.
    quoteLockHours: String((book.quoteLockMinutes ?? QUOTE_LOCK_MINUTES) / 60),
    freeWaitHours:
      book.freeWaitMinutes == null ? "" : String(book.freeWaitMinutes / 60),
  };
}

async function resolveVersionId(
  env: CloudflareEnv,
  claims: Parameters<typeof loadRateVersions>[1],
  raw: unknown,
): Promise<number | null> {
  const parsed = optionalId(raw) ?? asInt(raw);
  const versions = await loadRateVersions(env, claims);
  if (parsed != null && parsed > 0) return parsed;
  const draft = versions.find((row) => row.status === "draft");
  if (draft) return draft.id;
  const live = versions.find((row) => row.status === "live");
  return live ? live.id : versions[0]?.id ?? null;
}

async function resolveWritableVersionId(
  env: CloudflareEnv,
  claims: Parameters<typeof loadRateVersions>[1],
  raw: unknown,
): Promise<number | null> {
  const parsed = optionalId(raw) ?? asInt(raw);
  const versions = await loadRateVersions(env, claims);
  if (parsed != null && parsed > 0) {
    const hit = versions.find((row) => row.id === parsed);
    if (!hit) return parsed;
    if (hit.status === "draft") return hit.id;
    if (hit.status === "live") return forkLiveRateVersion(env, claims, hit);
    return hit.id;
  }
  const draft = versions.find((row) => row.status === "draft");
  if (draft) return draft.id;
  const live = versions.find((row) => row.status === "live");
  if (live) return forkLiveRateVersion(env, claims, live);
  return versions[0]?.id ?? null;
}

function failWrite(err: unknown): Response {
  if (err instanceof RateBookInputError) return jsonErr(err.key, 400);
  if (err instanceof CouponInputError) return jsonErr(err.key, 400);
  const classified = classifyPricingFailure(err);
  switch (classified.kind) {
    case "frozen":
      return jsonErr("frozen", 409);
    case "duplicate":
      return jsonErr("duplicate", 409);
    case "check":
      return jsonErr("check", 409);
    case "forbidden":
      return jsonErr("forbidden", 403);
    case "fk": {
      const detail =
        typeof err === "object" &&
        err !== null &&
        "detail" in err &&
        typeof (err as { detail: unknown }).detail === "string"
          ? (err as { detail: string }).detail
          : "";
      return jsonErr(/is not present/i.test(detail) ? "fk-missing" : "fk", 400);
    }
    default:
      return jsonErr("unknown", 500);
  }
}

function boolish(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function parseDistanceInput(body: Record<string, unknown>, classes: { id: string; slug: string }[]): DistanceRateInput {
  const slug = klassSlug(body.klass) || klassSlug(body.vehicleClassSlug);
  const vehicleClassId =
    typeof body.vehicleClassId === "string" && body.vehicleClassId
      ? body.vehicleClassId
      : (classes.find((c) => c.slug === slug)?.id ?? classes.find((c) => klassLabel(c.slug) === String(body.klass || ""))?.id ?? "");
  const maxPax = asInt(body.maxPax);
  return {
    vehicleClassId,
    baseFareRappen:
      body.baseFareRappen !== undefined ? rappenFromUnknown(body.baseFareRappen) : rappenFromMoneySet(body.baseFare),
    perKmRappen:
      body.perKmRappen !== undefined ? rappenFromUnknown(body.perKmRappen) : rappenFromMoneySet(body.perKm),
    minFareRappen:
      body.minFareRappen !== undefined ? rappenFromUnknown(body.minFareRappen) : rappenFromMoneySet(body.minFare),
    airportStartRappen:
      body.airportStartRappen !== undefined
        ? rappenFromUnknown(body.airportStartRappen)
        : rappenFromMoneySet(body.airportStart),
    // Decision 6: empty seats stay null; the class is a Draft until it has both counts.
    maxPax: maxPax ?? null,
    available: boolish(body.available, true),
    hideFromPublic: boolish(body.hideFromPublic ?? body.hide_from_public, false),
  };
}

function statedCheckoutRappen(body: Record<string, unknown>): number | null {
  const value = body.value;
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    return rappenFromUnknown(value);
  }
  if (body.amountRappen !== undefined) return rappenFromUnknown(body.amountRappen);
  return rappenFromMoneySet(body.amounts);
}

function parseSurchargeInput(body: Record<string, unknown>): SurchargeInput {
  const type = typeof body.type === "string" ? body.type : "";
  let raw =
    typeof body.code === "string" && body.code
      ? body.code
      : typeof body.label === "string"
        ? body.label
        : "";
  let kindRaw = typeof body.kind === "string" ? body.kind : "amount";
  if (type === "checkout_extra") {
    const named = typeof body.name === "string" ? body.name : raw;
    raw =
      typeof named === "string"
        ? named.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : raw;
    const decided = checkoutExtraKindFromRappen(statedCheckoutRappen(body));
    kindRaw = decided === "included" ? "included" : "amount";
  }
  // 26.2-p4: the code is the owner's name as typed (slug only). Never renamed, never matched.
  const code = raw;
  const kind: SurchargeKind =
    kindRaw === "percent" || kindRaw === "included" || kindRaw === "amount" ? kindRaw : "amount";
  const appliesRaw = typeof body.appliesTo === "string" ? body.appliesTo : typeof body.rule === "string" ? body.rule : "leg";
  const amountFromValue =
    body.value !== undefined ? rappenFromUnknown(body.value) : undefined;
  return {
    code,
    kind,
    amountRappen:
      kind === "included"
        ? null
        : body.amountRappen !== undefined
          ? rappenFromUnknown(body.amountRappen)
          : amountFromValue !== undefined
            ? amountFromValue
            : rappenFromMoneySet(body.amounts),
    percent:
      kind === "included"
        ? null
        : body.percent !== undefined
          ? percentFromUnknown(body.percent)
          : percentFromUnknown(body.pct),
    appliesTo: appliesRaw === "booking" ? "booking" : "leg",
    active: boolish(body.active, true),
  };
}


type ExtraLabelDbRow = {
  code: string;
  label_en: string;
  label_de: string | null;
  label_fr: string | null;
  label_ar: string | null;
  machine_langs: string[] | null;
};

function labelRowFromDb(row: ExtraLabelDbRow): ExtraLabelRow {
  return {
    en: row.label_en,
    de: row.label_de,
    fr: row.label_fr,
    ar: row.label_ar,
    machineLangs: (row.machine_langs ?? []).filter((l): l is ExtraLang =>
      (EXTRA_LANGS as readonly string[]).includes(l),
    ),
  };
}

/** D-44: per-language names of checkout extras, keyed by surcharge code. Empty on any read failure. */
async function readExtraLabels(
  env: Parameters<typeof loadRateBook>[0],
  claims: Parameters<typeof loadRateBook>[1],
): Promise<Record<string, ExtraLabelRow>> {
  try {
    const rows = await asStaff(env, claims, async (tx) => {
      return (await tx`select * from public.extra_labels_read()`) as unknown as ExtraLabelDbRow[];
    });
    const out: Record<string, ExtraLabelRow> = {};
    for (const row of rows) out[row.code] = labelRowFromDb(row);
    return out;
  } catch {
    console.error("extra_label_read");
    return {};
  }
}

function withExtraLabels<T extends { surcharges: Record<string, unknown>[] }>(
  payload: T,
  labels: Record<string, ExtraLabelRow>,
): T {
  return {
    ...payload,
    surcharges: payload.surcharges.map((row) => {
      const l = labels[String(row.code)];
      if (!l) return row;
      return {
        ...row,
        labelEn: l.en,
        labelDe: l.de ?? "",
        labelFr: l.fr ?? "",
        labelAr: l.ar ?? "",
        machineLangs: l.machineLangs,
      };
    }),
  };
}

/**
 * Save the four-language name of an extra. Never throws: the surcharge save has already succeeded (F-07).
 * Missing languages are filled by the shared translator (Phase 32, `lib/translate`) with one call at save
 * time; whatever it could not fill stays empty and the nightly fill (`system_extra_label_fill`) completes it.
 * A name he typed is never replaced (D-02). No machine mark is shown on Pricing (D-10).
 */
async function saveExtraLabels(
  env: Parameters<typeof loadRateBook>[0],
  claims: Parameters<typeof loadRateBook>[1],
  code: string,
  recBody: Record<string, unknown>,
): Promise<void> {
  try {
    const en = String(recBody.name ?? recBody.labelEn ?? recBody.label_en ?? "").trim();
    if (!en) return;
    const raw = (recBody.labels && typeof recBody.labels === "object" ? recBody.labels : {}) as Record<string, unknown>;
    const labels = {
      de: raw.de ?? recBody.labelDe ?? recBody.label_de,
      fr: raw.fr ?? recBody.labelFr ?? recBody.label_fr,
      ar: raw.ar ?? recBody.labelAr ?? recBody.label_ar,
    };
    const existingAll = await readExtraLabels(env, claims);
    const ai = (env as { AI?: AiLike }).AI;
    const plan = await planExtraLabels(ai, existingAll[code] ?? null, { en, labels });
    await asStaff(env, claims, async (tx) => {
      await tx`
        select * from public.staff_extra_label_upsert(
          ${code}, ${plan.en}, ${plan.de}, ${plan.fr}, ${plan.ar}, ${pgTextArrayLiteral(plan.machineLangs)}::text[]
        )
      `;
      return null;
    });
  } catch {
    console.error("extra_label_translate");
  }
}

export const GET = withStaff(async (claims, request) => {
  const url = new URL(request.url);
  const { env } = getCloudflareContext();
  const versionId = await resolveVersionId(env, claims, url.searchParams.get("versionId"));
  if (versionId == null) return jsonErr("not-found", 404);
  const book = await loadRateBook(env, claims, versionId);
  if (!book) return jsonErr("not-found", 404);
  const zones = await loadServiceZones(env, claims);
  return jsonOk(withExtraLabels(bookPayload(book, zones), await readExtraLabels(env, claims)));
});

function classOrderRows(raw: unknown): { id: string; sortOrder: number }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const rows: { id: string; sortOrder: number }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = asVehicleClassUuid(String((item as { vehicleClassId?: unknown }).vehicleClassId || ""));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const sortOrder = rows.length * 10;
    if (sortOrder > 32767) break;
    rows.push({ id, sortOrder });
  }
  return rows;
}

/** Comment 2. Persists class order on vehicle_classes.sort_order only. Does not flip active or hide_from_public. */
async function persistClassOrder(
  env: Parameters<typeof loadRateBook>[0],
  claims: Parameters<typeof loadRateBook>[1],
  recBody: Record<string, unknown>,
): Promise<Response> {
  const rows = classOrderRows(recBody.order);
  if (!rows.length) return jsonErr("invalid", 400);
  await asStaff(env, claims, async (tx) => {
    for (const row of rows) {
      await tx`
        update public.vehicle_classes
           set sort_order = ${row.sortOrder}
         where id = ${row.id}
      `;
    }
    return null;
  });
  const versionId = await resolveVersionId(env, claims, recBody.versionId);
  if (versionId == null) return jsonOk({ rates: [] });
  const book = await loadRateBook(env, claims, versionId);
  if (!book) return jsonOk({ rates: [] });
  const zones = await loadServiceZones(env, claims);
  return jsonOk(bookPayload(book, zones));
}

export const PUT = withAdmin(async (claims, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErr("invalid", 400);
  }
  const recBody = rec(body);
  if (!recBody) return jsonErr("invalid", 400);
  if (!isDraftKind(recBody.kind)) {
    return jsonErr("invalid", 400);
  }
  const kind = recBody.kind;

  const { env } = getCloudflareContext();
  if (kind === "distance" && recBody.reorder === true) {
    try {
      return await persistClassOrder(env, claims, recBody);
    } catch (err) {
      return failWrite(err);
    }
  }
  // Kind `rule` is checked before resolveWritableVersionId so a refused value never forks a draft.
  let ruleSetting: { kind: "vat"; bps: number } | { kind: "quote_lock"; minutes: number } | null = null;
  if (kind === "rule") {
    ruleSetting = parseRuleSetting(recBody);
    if (!ruleSetting) return jsonErr("invalid", 400);
  }
  const versionId = await resolveWritableVersionId(env, claims, recBody.versionId);
  if (versionId == null) return jsonErr("not-found", 404);
  const id = optionalId(recBody.id);

  try {
    if (kind === "distance") {
      const book = await loadRateBook(env, claims, versionId);
      if (!book) return jsonErr("not-found", 404);
      const classes = uniqueClasses(book.distanceRates, book.vehicleClasses);
      const incoming = parseDistanceInput(recBody, classes);
      const className =
        (typeof recBody.name === "string" && recBody.name.trim()) ||
        (typeof recBody.klass === "string" && recBody.klass.trim()) ||
        "";
      const slug = klassSlug(className);
      const photoRaw = recBody.photoPath ?? recBody.photo;
      const photoPath =
        photoRaw === ""
          ? null
          : typeof photoRaw === "string" && photoRaw && !photoRaw.startsWith("data:")
            ? photoRaw
            : undefined;
      // Decision 6: a bag count is never copied from seats; empty stays null.
      const maxBags = asInt(recBody.maxBags ?? recBody.luggageCapacity) ?? null;
      const classPlan = planVehicleClassWrite(
        incoming.vehicleClassId,
        slug,
        book.vehicleClasses,
      );
      const existingClass =
        classPlan.mode === "update"
          ? book.vehicleClasses.find((row) => row.id === classPlan.id)
          : undefined;
      // Phase 30 pitfall 4: a retired class stays hidden; typing its name must not write to it.
      if (existingClass && existingClass.hiddenReason != null) return jsonErr("class-retired", 409);
      // A class created by this request is a Draft.
      const classIsLive = !!existingClass && existingClass.active === true;
      // Decision 6: seats and bags can be emptied only while the class is a Draft.
      if (classIsLive && (incoming.maxPax === null || maxBags === null)) return jsonErr("invalid", 400);
      let vehicleClassId = classPlan.mode === "update" ? classPlan.id : classPlan.id ?? "";
      try {
        await asStaff(env, claims, async (tx) => {
          if (classPlan.mode === "insert") {
            if (!slug) throw new RateBookInputError("rateBook.error-class-required");
            const maxRows = await tx<{ n: number | string | null }[]>`
              select coalesce(max(sort_order), 0) as n from public.vehicle_classes
            `;
            const nextSort = Math.min(32767, Number(maxRows[0]?.n ?? 0) + 10);
            if (classPlan.id) {
              const created = await tx<{ id: string }[]>`
                insert into public.vehicle_classes (
                  id, slug, passenger_capacity, luggage_capacity, sort_order, active, name, photo_path
                ) values (
                  ${classPlan.id}, ${slug}, ${incoming.maxPax}, ${maxBags}, ${nextSort}, false,
                  ${className || slug}, ${photoPath ?? null}
                )
                returning id
              `;
              vehicleClassId = created[0]?.id ?? classPlan.id;
            } else {
              const created = await tx<{ id: string }[]>`
                insert into public.vehicle_classes (
                  slug, passenger_capacity, luggage_capacity, sort_order, active, name, photo_path
                ) values (
                  ${slug}, ${incoming.maxPax}, ${maxBags}, ${nextSort}, false, ${className || slug},
                  ${photoPath ?? null}
                )
                returning id
              `;
              vehicleClassId = created[0]?.id ?? "";
            }
          } else {
            vehicleClassId = classPlan.id;
            const slugTaken = !!(
              slug &&
              book.vehicleClasses.some((row) => row.slug === slug && row.id !== vehicleClassId)
            );
            const nextSlug = slugTaken ? "" : slug;
            await tx`
              update public.vehicle_classes set
                slug = coalesce(nullif(${nextSlug}, ''), slug),
                name = coalesce(nullif(${className}, ''), name),
                photo_path = coalesce(${photoPath ?? null}, photo_path),
                passenger_capacity = ${incoming.maxPax},
                luggage_capacity = ${maxBags}
              where id = ${vehicleClassId}
            `;
          }
          const parsed = assertDistanceRateInput({ ...incoming, vehicleClassId });
          // Phase 30 decision 5: a Draft class's empty row is parked; a priced one counts.
          const existing = findExistingDistanceRate(book, id, parsed.vehicleClassId);
          if (existing) {
            await tx`
              update public.distance_rates set
                vehicle_class_id = ${parsed.vehicleClassId},
                base_fare_rappen = ${parsed.baseFareRappen},
                per_km_rappen = ${parsed.perKmRappen},
                min_fare_rappen = ${parsed.minFareRappen},
                airport_start_rappen = ${parsed.airportStartRappen},
                max_pax = ${parsed.maxPax},
                available = ${draftRowAvailable(classIsLive, parsed, incoming.maxPax, maxBags)},
                hide_from_public = ${parsed.hideFromPublic}
              where id = ${existing.id} and rate_version_id = ${versionId}
            `;
          } else {
            await tx`
              insert into public.distance_rates (
                rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen,
                min_fare_rappen, airport_start_rappen,
                max_pax, available, hide_from_public
              ) values (
                ${versionId}, ${parsed.vehicleClassId}, ${parsed.baseFareRappen},
                ${parsed.perKmRappen}, ${parsed.minFareRappen},
                ${parsed.airportStartRappen},
                ${parsed.maxPax}, ${draftRowAvailable(classIsLive, parsed, incoming.maxPax, maxBags)},
                ${parsed.hideFromPublic}
              )
            `;
          }
          return null;
        });
      } catch (err) {
        // 23514 on vehicle_classes_live_has_seats_bags: the second wall behind the check above.
        const e = err as { code?: unknown; constraint?: unknown } | null;
        if (e?.code === "23514" && (e.constraint === undefined || e.constraint === "vehicle_classes_live_has_seats_bags")) {
          return jsonErr("invalid", 400);
        }
        throw err;
      }
      const next = await loadRateBook(env, claims, versionId);
      if (!next) return jsonErr("not-found", 404);
      const zones = await loadServiceZones(env, claims);
      const payload = bookPayload(next, zones);
      return jsonOk(payload);
    }

    if (kind === "surcharge") {
      if (
        recBody.type === "checkout_extra" &&
        checkoutExtraKindFromRappen(statedCheckoutRappen(recBody)) == null
      ) {
        return jsonErr("invalid", 400);
      }
      const parsed = assertSurchargeInput(parseSurchargeInput(recBody));
      await asStaff(env, claims, async (tx) => {
        // 26.2-p4: every extra saved here is chosen by the customer on /checkout — one
        // rule, whatever its name, and no quantity source. The rule goes through the
        // driver's JSON helper so Postgres stores a JSON object: `${JSON.stringify(x)}::jsonb`
        // is serialised a second time by the driver and lands as a JSON string.
        const rule = tx.json(MANUAL_PREDICATE);
        if (id != null) {
          // 26.2-bp B9: the page may name the live book's row; write the draft's.
          const rowId = await draftRowId(tx, "surcharge", id, versionId);
          await tx`
            update public.surcharges set
              code = ${parsed.code},
              kind = ${parsed.kind},
              amount_rappen = ${parsed.amountRappen},
              percent = ${parsed.percent},
              applies_to = ${parsed.appliesTo},
              active = ${parsed.active},
              predicate = ${rule},
              quantity_source = null
            where id = ${rowId} and rate_version_id = ${versionId}
          `;
        } else {
          await tx`
            insert into public.surcharges (
              rate_version_id, code, kind, amount_rappen, percent, applies_to, active,
              predicate, quantity_source
            ) values (
              ${versionId}, ${parsed.code}, ${parsed.kind}, ${parsed.amountRappen},
              ${parsed.percent}, ${parsed.appliesTo}, ${parsed.active},
              ${rule}, null
            )
          `;
        }
        return null;
      });
      const next = await loadRateBook(env, claims, versionId);
      if (!next) return jsonErr("not-found", 404);
      const zones = await loadServiceZones(env, claims);
      if (recBody.type === "checkout_extra") {
        await saveExtraLabels(env, claims, parsed.code, recBody);
      }
      const payload = withExtraLabels(bookPayload(next, zones), await readExtraLabels(env, claims));
      const saved =
        payload.surcharges.find((row) => row.code === parsed.code) ??
        (id != null ? payload.surcharges.find((row) => row.id === String(id)) : undefined);
      return jsonOk(saved ?? payload);
    }

    if (kind === "rule" && ruleSetting) {
      const setting = ruleSetting;
      await asStaff(env, claims, async (tx) => {
        if (setting.kind === "vat") {
          await tx`
            update public.rate_versions
               set vat_rate_bps = ${setting.bps}
             where id = ${versionId} and status = 'draft'
          `;
        } else {
          // Decision 2026-10-13 item 13 (signed 2026-10-14): Pricing › Distance rules "Price stays
          // valid for" edits the draft's quote_lock_minutes; Publish keeps it. The one writer of
          // quote_lock_minutes; no other PUT kind touches it.
          await tx`
            update public.rate_versions
               set quote_lock_minutes = ${setting.minutes}
             where id = ${versionId} and status = 'draft'
          `;
        }
        return null;
      });
      const next = await loadRateBook(env, claims, versionId);
      if (!next) return jsonErr("not-found", 404);
      const zones = await loadServiceZones(env, claims);
      return jsonOk(bookPayload(next, zones));
    }

    if (kind === "coupon") {
      const parsed = couponInputFromDc(recBody);
      if (id != null) {
        const row = await updateCouponRecord(env, claims, id, parsed);
        if (!row) return jsonErr("not-found", 404);
      } else {
        await insertCoupon(env, claims, parsed, versionId);
      }
      const next = await loadRateBook(env, claims, versionId);
      if (!next) return jsonErr("not-found", 404);
      const zones = await loadServiceZones(env, claims);
      return jsonOk(bookPayload(next, zones));
    }

    if (kind !== "route") return jsonErr("invalid", 400);
    if (!hasMapboxFromTo(recBody)) return jsonErr("mapbox", 400);

    const book = await loadRateBook(env, claims, versionId);
    if (!book) return jsonErr("not-found", 404);
    const zones = await loadServiceZones(env, claims);
    // D-10 (26.1-10): a fresh Mapbox pick always resolves server-side to its official zone —
    // a zone id the client matched from the pick's text is ignored. A zone id alone (that end
    // was not re-picked) still selects that zone.
    const language = geoLanguageFromPath(
      new URL(request.url).pathname,
      request.headers.get("accept-language"),
    );
    const zoneFor = async (pin: unknown, zoneId: unknown): Promise<ServiceZoneRow | undefined> => {
      if (mapboxIdFromPin(pin)) return ensureMapboxZone(env, claims, pin, language);
      if (typeof zoneId === "string" && zoneId) return zones.find((z) => z.id === zoneId);
      return undefined;
    };
    const origin = await zoneFor(
      recBody.fromMapbox ?? recBody.from_mapbox_id ?? recBody.originMapbox,
      recBody.originZoneId,
    );
    const dest = await zoneFor(
      recBody.toMapbox ?? recBody.to_mapbox_id ?? recBody.destMapbox,
      recBody.destZoneId,
    );
    if (!origin || !dest) return jsonErr("mapbox", 400);
    const live = boolish(recBody.live, false);
    const slugSet = new Set<string>();
    for (const row of book.distanceRates) slugSet.add(row.vehicleClassSlug);
    const bodySlug = klassSlug(recBody.vehicleClassSlug);
    if (bodySlug) slugSet.add(bodySlug);
    const pricesObj = rec(recBody.prices);
    if (pricesObj) {
      for (const key of Object.keys(pricesObj)) {
        const slug = klassSlug(key);
        if (slug) slugSet.add(slug);
      }
    }
    const classPrices: { slug: string; price: number | null }[] = [...slugSet].map((slug) => ({
      slug,
      price:
        recBody.priceRappen !== undefined && typeof recBody.vehicleClassId === "string"
          ? rappenFromUnknown(recBody.priceRappen)
          : rappenFromMoneySet((pricesObj && pricesObj[slug]) ?? recBody[slug]),
    }));
    const nativeClassId = typeof recBody.vehicleClassId === "string" ? recBody.vehicleClassId : "";
    const targets =
      nativeClassId && recBody.priceRappen !== undefined
        ? [{ vehicleClassId: nativeClassId, slug: klassSlug(recBody.vehicleClassSlug) || "", price: rappenFromUnknown(recBody.priceRappen) }]
        : classPrices.map((row) => ({
            vehicleClassId: classIdFor(book.distanceRates, book.fixedRoutes, row.slug),
            slug: row.slug,
            price: row.price,
          }));

    for (const target of targets) {
      if (!target.vehicleClassId) continue;
      const parsed = assertFixedRouteInput({
        originZoneId: origin.id,
        destZoneId: dest.id,
        vehicleClassId: target.vehicleClassId,
        priceRappen: target.price,
        live,
      } satisfies FixedRouteInput);
      const existing = book.fixedRoutes.find(
        (row) =>
          row.originZoneId === parsed.originZoneId &&
          row.destZoneId === parsed.destZoneId &&
          row.vehicleClassId === parsed.vehicleClassId,
      );
      const rowId = existing?.id ?? (targets.length === 1 ? id : null);
      await asStaff(env, claims, async (tx) => {
        if (rowId != null) {
          await tx`
            update public.fixed_routes set
              origin_zone_id = ${parsed.originZoneId},
              dest_zone_id = ${parsed.destZoneId},
              vehicle_class_id = ${parsed.vehicleClassId},
              price_rappen = ${parsed.priceRappen},
              live = ${parsed.live}
            where id = ${rowId} and rate_version_id = ${versionId}
          `;
        } else {
          await tx`
            insert into public.fixed_routes (
              rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live
            ) values (
              ${versionId}, ${parsed.originZoneId}, ${parsed.destZoneId},
              ${parsed.vehicleClassId}, ${parsed.priceRappen}, ${parsed.live}
            )
          `;
        }
        return null;
      });
    }

    const next = await loadRateBook(env, claims, versionId);
    if (!next) return jsonErr("not-found", 404);
    const nextZones = await loadServiceZones(env, claims);
    const payload = bookPayload(next, nextZones);
    const saved = payload.routes.find(
      (row) => row.originZoneId === origin.id && row.destZoneId === dest.id,
    );
    return jsonOk(saved ?? payload);
  } catch (err) {
    return failWrite(err);
  }
});

export const DELETE = withAdmin(async (claims, request) => {
  const url = new URL(request.url);
  let recBody: Record<string, unknown> | null = null;
  try {
    recBody = rec(await request.json());
  } catch {
    recBody = null;
  }
  const kind = recBody?.kind ?? url.searchParams.get("kind");
  const id = optionalId(recBody?.id ?? url.searchParams.get("id"));
  if (!isDraftKind(kind) || id == null) return jsonErr("invalid", 400);

  // Kind `rule` is a book setting, not a row: nothing to delete.
  const table =
    kind === "surcharge"
      ? "surcharges"
      : kind === "coupon"
        ? "coupons"
        : kind === "route"
          ? "fixed_routes"
          : kind === "distance"
            ? "distance_rates"
            : null;
  if (!table) return jsonErr("invalid", 400);

  const { env } = getCloudflareContext();
  const versionId = await resolveWritableVersionId(
    env,
    claims,
    recBody?.versionId ?? url.searchParams.get("versionId"),
  );
  if (versionId == null) return jsonErr("not-found", 404);

  try {
    await asStaff(env, claims, async (tx) => {
      if (table === "coupons") {
        await tx`
          delete from public.coupons
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else if (table === "surcharges") {
        const rowId = await draftRowId(tx, "surcharge", id, versionId);
        await tx`
          delete from public.surcharges
          where id = ${rowId} and rate_version_id = ${versionId}
        `;
      } else if (table === "fixed_routes") {
        const rowId = await draftRowId(tx, "route", id, versionId);
        await tx`
          delete from public.fixed_routes
          where rate_version_id = ${versionId}
            and (origin_zone_id, dest_zone_id) in (
              select origin_zone_id, dest_zone_id
                from public.fixed_routes
               where id = ${rowId} and rate_version_id = ${versionId}
            )
        `;
      } else {
        const rowId = await draftRowId(tx, "distance", id, versionId);
        await tx`
          delete from public.distance_rates
          where id = ${rowId} and rate_version_id = ${versionId}
        `;
      }
      return null;
    });
    // 26.2-p4 A6: a deleted extra takes its four-language names with it once no live or
    // draft book uses its code any more.
    if (table === "surcharges") await pruneExtraLabels(env, claims);
    const next = await loadRateBook(env, claims, versionId);
    if (!next) return jsonErr("not-found", 404);
    const zones = await loadServiceZones(env, claims);
    return jsonOk(bookPayload(next, zones));
  } catch (err) {
    return failWrite(err);
  }
});

/**
 * 26.2-bp B9. The pricing page shows the live book while no draft exists and sends that
 * book's row ids; the first write forks a draft whose rows have new ids, so
 * `where id = <live id> and rate_version_id = <draft>` matched nothing and the write was
 * lost with a 200. This returns the row of `versionId` that `id` stands for: the row itself
 * when it belongs to that version, else its copy (same key cloneRateVersionFrom copies by).
 * An id that matches nothing is returned unchanged, so the write still matches nothing.
 */
async function draftRowId(
  tx: Parameters<Parameters<typeof asStaff>[2]>[0],
  kind: "surcharge" | "route" | "distance",
  id: number,
  versionId: number,
): Promise<number> {
  let rows: { id: number | string }[];
  if (kind === "surcharge") {
    rows = await tx<{ id: number | string }[]>`
      select n.id
        from public.surcharges n
        join public.surcharges o on o.code = n.code
       where o.id = ${id} and n.rate_version_id = ${versionId}
       order by (n.id = o.id) desc, n.id
       limit 1
    `;
  } else if (kind === "route") {
    rows = await tx<{ id: number | string }[]>`
      select n.id
        from public.fixed_routes n
        join public.fixed_routes o
          on o.origin_zone_id = n.origin_zone_id
         and o.dest_zone_id = n.dest_zone_id
         and o.vehicle_class_id = n.vehicle_class_id
       where o.id = ${id} and n.rate_version_id = ${versionId}
       order by (n.id = o.id) desc, n.id
       limit 1
    `;
  } else {
    rows = await tx<{ id: number | string }[]>`
      select n.id
        from public.distance_rates n
        join public.distance_rates o on o.vehicle_class_id = n.vehicle_class_id
       where o.id = ${id} and n.rate_version_id = ${versionId}
       order by (n.id = o.id) desc, n.id
       limit 1
    `;
  }
  const found = Number(rows[0]?.id);
  return Number.isInteger(found) && found > 0 ? found : id;
}

function findExistingDistanceRate(
  book: RateBook,
  id: number | null,
  vehicleClassId: string,
): DistanceRateRow | undefined {
  if (id != null) {
    const byId = book.distanceRates.find((row) => row.id === id);
    if (byId) return byId;
  }
  if (vehicleClassId) {
    return book.distanceRates.find((row) => row.vehicleClassId === vehicleClassId);
  }
  return undefined;
}

function uniqueClasses(
  rows: DistanceRateRow[],
  extras: { id: string; slug: string }[] = [],
): { id: string; slug: string }[] {
  const seen = new Map<string, { id: string; slug: string }>();
  for (const row of extras) {
    if (!seen.has(row.id)) seen.set(row.id, { id: row.id, slug: row.slug });
  }
  for (const row of rows) {
    if (!seen.has(row.vehicleClassId)) {
      seen.set(row.vehicleClassId, { id: row.vehicleClassId, slug: row.vehicleClassSlug });
    }
  }
  return [...seen.values()];
}

function classIdFor(distance: DistanceRateRow[], routes: FixedRouteRow[], slug: string): string {
  const fromDistance = distance.find((row) => row.vehicleClassSlug === slug);
  if (fromDistance) return fromDistance.vehicleClassId;
  const fromRoute = routes.find((row) => row.vehicleClassSlug === slug);
  return fromRoute?.vehicleClassId ?? "";
}
