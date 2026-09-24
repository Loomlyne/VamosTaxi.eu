// apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
//
// GET  /api/staff/rate-book?versionId= — hydrate overlay collections.
// PUT  /api/staff/rate-book — upsert draft { kind: route|distance|band|surcharge|rule|coupon }. Kind region is invalid.
// Missing version → JSON 404. Unauthenticated → JSON 401. CHF only. No postgres.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { loadRateVersions } from "@/lib/ops/pricing";
import {
  assertDistanceRateInput,
  assertFixedRouteInput,
  assertSurchargeInput,
  classifyPricingFailure,
  loadRateBook,
  loadServiceZones,
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
import { isPlaceholderAmount, rappenFromMoneySet, rappenFromUnknown } from "@/lib/ops/rappen";
import { extraWriteFields, isPassengerExtra, normalizeSurchargeCode } from "@/lib/ops/surcharge-codes";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";
import { planVehicleClassWrite } from "@/lib/ops/vehicle-class-write";
import {
  CouponInputError,
  couponInputFromDc,
  insertCoupon,
  updateCouponRecord,
} from "@/lib/ops/coupons";
import {
  mapboxIdFromPin,
  placeLabelFromPin,
  skiZoneType,
  zoneSlugFromPlace,
  pgTextArrayLiteral,
} from "@/lib/ops/mapbox-zone";

export const dynamic = "force-dynamic";

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRAFT_KINDS = ["route", "distance", "band", "surcharge", "rule", "coupon"] as const;
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

/** D-20: DC sends hours; store minutes on the draft rate_versions row. */
function quoteLockMinutesFromHours(hours: unknown): number | null {
  return minutesFromHours(hours);
}

/** D-23: free-wait hours → minutes on the draft. */
function minutesFromHours(hours: unknown): number | null {
  const n =
    typeof hours === "number"
      ? hours
      : typeof hours === "string" && hours.trim() !== ""
        ? Number(hours)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * 60;
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

function matchZone(zones: ServiceZoneRow[], value: unknown): ServiceZoneRow | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const raw = value.trim();
  const byId = zones.find((z) => z.id === raw);
  if (byId) return byId;
  const iata = /\(([A-Z]{3})\)/.exec(raw)?.[1];
  if (iata) {
    const byIata = zones.find((z) => z.iata === iata);
    if (byIata) return byIata;
  }
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const bySlug = zones.find((z) => z.slug === slug);
  if (bySlug) return bySlug;
  const exactDisplay = zones.find((z) => zoneDisplay(z) === raw);
  if (exactDisplay) return exactDisplay;
  const lower = raw.toLowerCase();
  return zones.find((z) => {
    const label = (z.label || z.slug || "").toLowerCase();
    if (label && lower.includes(label)) return true;
    if (z.iata && raw.toUpperCase().includes(z.iata)) return true;
    const slugWords = (z.slug || "").replace(/-/g, " ");
    if (slugWords && lower.includes(slugWords)) return true;
    return false;
  });
}

async function ensureMapboxZone(
  env: CloudflareEnv,
  claims: VamosClaims,
  zones: ServiceZoneRow[],
  pin: unknown,
  text: unknown,
): Promise<ServiceZoneRow | undefined> {
  const label = placeLabelFromPin(pin, text);
  const mapboxId = mapboxIdFromPin(pin);
  if (!label && !mapboxId) return undefined;
  const slug = zoneSlugFromPlace(label || mapboxId, mapboxId);
  const existing = zones.find((z) => z.slug === slug) ?? matchZone(zones, label);
  if (existing) return existing;
  const zoneType = skiZoneType(label);
  const tags = mapboxId ? [`mapbox:${mapboxId}`] : [];
  const name = label || slug;
  const inserted = await asStaff(env, claims, async (tx) => {
    const rows = await tx<Array<{ id: string; slug: string; iata: string | null; active: boolean }>>`
      insert into public.service_zones (slug, iata, active, zone_type, tags)
      values (${slug}, null, true, ${zoneType}, ${pgTextArrayLiteral(tags)}::text[])
      on conflict (slug) do update set active = true
      returning id, slug, iata, active
    `;
    const row = rows[0];
    if (!row) return null;
    await tx`
      insert into public.content_strings (key, en, de, fr, ar, non_translatable)
      values (${`zone.${row.slug}`}, ${name}, ${name}, ${name}, ${name}, true)
      on conflict (key) do nothing
    `;
    return row;
  });
  if (!inserted) return undefined;
  return {
    id: inserted.id,
    slug: inserted.slug,
    iata: inserted.iata,
    active: inserted.active,
    label: name,
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
      baseFare: moneyFromRappen(row.baseFareRappen),
      perKm: moneyFromRappen(row.perKmRappen),
      minFare: moneyFromRappen(row.minFareRappen),
      airportStart: moneyFromRappen(row.airportStartRappen),
      cityPrice: moneyFromRappen(row.cityPriceRappen),
      maxPax: row.maxPax,
      maxBags: cls?.luggageCapacity ?? "",
      photo,
      photoPath: photo,
      available: row.available,
      hideFromPublic: row.hideFromPublic,
    };
  });
}

function mockSurcharges(book: RateBook): Record<string, unknown>[] {
  return book.surcharges.map((row) => {
    const type = surchargeTypeFromCode(row.code);
    return {
      id: String(row.id),
      code: row.code,
      label: row.code,
      type,
      rule: row.appliesTo,
      ruleId: row.ruleId == null ? "" : String(row.ruleId),
      kind: row.kind,
      amounts: moneyFromRappen(row.amountRappen),
      pct: row.percent == null ? "" : String(row.percent),
      appliesTo: row.appliesTo,
      active: row.active,
      hours: type === "free_wait" ? "" : "",
    };
  });
}

function surchargeTypeFromCode(code: string): string {
  if (code === "meet_greet") return "meet_greet";
  if (code === "free_wait") return "free_wait";
  if (code === "extra_wait" || code === "waiting" || code === "waiting_city" || code === "waiting_airport") {
    return "extra_wait";
  }
  return "checkout_extra";
}

function mockBands(book: RateBook): Record<string, unknown>[] {
  return book.distanceBands.map((row) => ({
    id: String(row.id),
    fromKm: row.fromKm,
    toKm: row.toKm == null ? "" : row.toKm,
    perKm: moneyFromRappen(row.perKmRappen),
    vehicleClassId: row.vehicleClassId,
    klass: klassLabel(row.vehicleClassSlug),
  }));
}

function mockRegionPremiums(book: RateBook, zones: ServiceZoneRow[]): Record<string, unknown>[] {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  return book.regionPremiums.map((row) => {
    const zone = zoneById.get(row.zoneId);
    return {
      id: String(row.id),
      zoneId: row.zoneId,
      zone: zone ? zoneDisplay(zone) : row.zoneId,
      percent: String(row.percent),
    };
  });
}

function mockRules(book: RateBook): Record<string, unknown>[] {
  return book.rules.map((row) => ({
    id: String(row.id),
    kind: row.kind,
    payload:
      typeof row.payload === "string"
        ? row.payload
        : row.payload == null
          ? ""
          : JSON.stringify(row.payload),
  }));
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
    bands: mockBands(book),
    regionPremiums: mockRegionPremiums(book, zones),
    rules: mockRules(book),
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
    })),
    vatRateBps: book.vatRateBps,
    quoteLockHours:
      book.quoteLockMinutes == null ? "" : String(book.quoteLockMinutes / 60),
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
    cityPriceRappen:
      body.cityPriceRappen !== undefined
        ? rappenFromUnknown(body.cityPriceRappen)
        : rappenFromMoneySet(body.cityPrice),
    maxPax: maxPax ?? 1,
    available: boolish(body.available, true),
    hideFromPublic: boolish(body.hideFromPublic ?? body.hide_from_public, false),
  };
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
  if (type === "meet_greet") {
    raw = "meet_greet";
    kindRaw = "included";
  } else if (type === "free_wait") {
    raw = "free_wait";
    kindRaw = "included";
  } else if (type === "extra_wait") {
    raw = "extra_wait";
    kindRaw = "amount";
  } else if (type === "checkout_extra") {
    const named = typeof body.name === "string" ? body.name : raw;
    raw =
      typeof named === "string"
        ? named.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : raw;
    kindRaw = "amount";
  }
  const code = raw ? normalizeSurchargeCode(raw) : "";
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
    ruleId: optionalId(body.ruleId ?? body.rule_id),
  };
}

export const GET = withStaff(async (claims, request) => {
  const url = new URL(request.url);
  const { env } = getCloudflareContext();
  const versionId = await resolveVersionId(env, claims, url.searchParams.get("versionId"));
  if (versionId == null) return jsonErr("not-found", 404);
  const book = await loadRateBook(env, claims, versionId);
  if (!book) return jsonErr("not-found", 404);
  const zones = await loadServiceZones(env, claims);
  return jsonOk(bookPayload(book, zones));
});

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
  const versionId = await resolveWritableVersionId(env, claims, recBody.versionId);
  if (versionId == null) return jsonErr("not-found", 404);
  const id = optionalId(recBody.id);

  try {
    const lockMinutes = quoteLockMinutesFromHours(
      recBody.quoteLockHours ?? recBody.quote_lock_hours,
    );
    if (lockMinutes != null) {
      await asStaff(env, claims, async (tx) => {
        await tx`
          update public.rate_versions
             set quote_lock_minutes = ${lockMinutes}
           where id = ${versionId} and status = 'draft'
        `;
        return null;
      });
    }

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
      const maxBags = asInt(recBody.maxBags ?? recBody.luggageCapacity) ?? incoming.maxPax;
      const classPlan = planVehicleClassWrite(
        incoming.vehicleClassId,
        slug,
        book.vehicleClasses,
      );
      let vehicleClassId = classPlan.mode === "update" ? classPlan.id : classPlan.id ?? "";
      await asStaff(env, claims, async (tx) => {
        if (classPlan.mode === "insert") {
          if (!slug) throw new RateBookInputError("rateBook.error-class-required");
          if (classPlan.id) {
            const created = await tx<{ id: string }[]>`
              insert into public.vehicle_classes (
                id, slug, passenger_capacity, luggage_capacity, sort_order, active, name, photo_path
              ) values (
                ${classPlan.id}, ${slug}, ${incoming.maxPax}, ${maxBags}, 0, true,
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
                ${slug}, ${incoming.maxPax}, ${maxBags}, 0, true, ${className || slug},
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
        const existing = findExistingDistanceRate(book, id, parsed.vehicleClassId);
        if (existing) {
          await tx`
            update public.distance_rates set
              vehicle_class_id = ${parsed.vehicleClassId},
              base_fare_rappen = ${parsed.baseFareRappen},
              per_km_rappen = ${parsed.perKmRappen},
              min_fare_rappen = ${parsed.minFareRappen},
              airport_start_rappen = ${parsed.airportStartRappen},
              city_price_rappen = ${parsed.cityPriceRappen},
              max_pax = ${parsed.maxPax},
              available = ${parsed.available},
              hide_from_public = ${parsed.hideFromPublic}
            where id = ${existing.id} and rate_version_id = ${versionId}
          `;
        } else {
          await tx`
            insert into public.distance_rates (
              rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen,
              min_fare_rappen, airport_start_rappen, city_price_rappen,
              max_pax, available, hide_from_public
            ) values (
              ${versionId}, ${parsed.vehicleClassId}, ${parsed.baseFareRappen},
              ${parsed.perKmRappen}, ${parsed.minFareRappen},
              ${parsed.airportStartRappen}, ${parsed.cityPriceRappen},
              ${parsed.maxPax}, ${parsed.available}, ${parsed.hideFromPublic}
            )
          `;
        }
        return null;
      });
      const next = await loadRateBook(env, claims, versionId);
      if (!next) return jsonErr("not-found", 404);
      const zones = await loadServiceZones(env, claims);
      const payload = bookPayload(next, zones);
      return jsonOk(payload);
    }

    if (kind === "surcharge") {
      const parsed = assertSurchargeInput(parseSurchargeInput(recBody));
      const extras = isPassengerExtra(parsed.code) ? extraWriteFields(parsed.code) : null;
      const waitMinutes = minutesFromHours(recBody.hours ?? recBody.freeWaitHours);
      await asStaff(env, claims, async (tx) => {
        if (waitMinutes != null && parsed.code === "free_wait") {
          await tx`
            update public.rate_versions
               set free_wait_minutes = ${waitMinutes}
             where id = ${versionId} and status = 'draft'
          `;
        }
        if (id != null) {
          if (extras) {
            await tx`
              update public.surcharges set
                code = ${parsed.code},
                kind = ${parsed.kind},
                amount_rappen = ${parsed.amountRappen},
                percent = ${parsed.percent},
                applies_to = ${parsed.appliesTo},
                active = ${parsed.active},
                predicate = ${JSON.stringify(extras.predicate)}::jsonb,
                quantity_source = ${extras.quantitySource},
                rule_id = ${parsed.ruleId}
              where id = ${id} and rate_version_id = ${versionId}
            `;
          } else {
            await tx`
              update public.surcharges set
                code = ${parsed.code},
                kind = ${parsed.kind},
                amount_rappen = ${parsed.amountRappen},
                percent = ${parsed.percent},
                applies_to = ${parsed.appliesTo},
                active = ${parsed.active},
                rule_id = ${parsed.ruleId}
              where id = ${id} and rate_version_id = ${versionId}
            `;
          }
        } else if (extras) {
          await tx`
            insert into public.surcharges (
              rate_version_id, code, kind, amount_rappen, percent, applies_to, active,
              predicate, quantity_source, rule_id
            ) values (
              ${versionId}, ${parsed.code}, ${parsed.kind}, ${parsed.amountRappen},
              ${parsed.percent}, ${parsed.appliesTo}, ${parsed.active},
              ${JSON.stringify(extras.predicate)}::jsonb, ${extras.quantitySource},
              ${parsed.ruleId}
            )
          `;
        } else {
          await tx`
            insert into public.surcharges (
              rate_version_id, code, kind, amount_rappen, percent, applies_to, active, rule_id
            ) values (
              ${versionId}, ${parsed.code}, ${parsed.kind}, ${parsed.amountRappen},
              ${parsed.percent}, ${parsed.appliesTo}, ${parsed.active}, ${parsed.ruleId}
            )
          `;
        }
        return null;
      });
      const next = await loadRateBook(env, claims, versionId);
      if (!next) return jsonErr("not-found", 404);
      const zones = await loadServiceZones(env, claims);
      const payload = bookPayload(next, zones);
      const saved =
        payload.surcharges.find((row) => row.code === parsed.code) ??
        (id != null ? payload.surcharges.find((row) => row.id === String(id)) : undefined);
      return jsonOk(saved ?? payload);
    }

    if (kind === "band") {
      const book = await loadRateBook(env, claims, versionId);
      if (!book) return jsonErr("not-found", 404);
      const classes = uniqueClasses(book.distanceRates, book.vehicleClasses);
      const klassSlugVal = klassSlug(recBody.klass) || klassSlug(recBody.vehicleClassSlug);
      const vehicleClassId =
        typeof recBody.vehicleClassId === "string" && recBody.vehicleClassId
          ? recBody.vehicleClassId
          : (classes.find((c) => c.slug === klassSlugVal)?.id ??
            classes.find((c) => klassLabel(c.slug) === String(recBody.klass || ""))?.id ??
            "");
      const fromKm = asInt(recBody.fromKm ?? recBody.from_km);
      const toRaw = recBody.toKm ?? recBody.to_km;
      const toKm = toRaw === null || toRaw === "" ? null : asInt(toRaw);
      const perKmRappen =
        recBody.perKmRappen !== undefined
          ? rappenFromUnknown(recBody.perKmRappen)
          : rappenFromMoneySet(recBody.perKm);
      if (!vehicleClassId || fromKm == null || fromKm < 0 || perKmRappen == null) {
        return jsonErr("invalid", 400);
      }
      await asStaff(env, claims, async (tx) => {
        if (id != null) {
          await tx`
            update public.distance_bands set
              vehicle_class_id = ${vehicleClassId},
              from_km = ${fromKm},
              to_km = ${toKm},
              per_km_rappen = ${perKmRappen}
            where id = ${id} and rate_version_id = ${versionId}
          `;
        } else {
          await tx`
            insert into public.distance_bands (
              rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen
            ) values (
              ${versionId}, ${vehicleClassId}, ${fromKm}, ${toKm}, ${perKmRappen}
            )
          `;
        }
        return null;
      });
      const next = await loadRateBook(env, claims, versionId);
      if (!next) return jsonErr("not-found", 404);
      const zones = await loadServiceZones(env, claims);
      return jsonOk(bookPayload(next, zones));
    }

    if (kind === "rule") {
      const ruleKindRaw =
        typeof recBody.ruleKind === "string"
          ? recBody.ruleKind
          : typeof recBody.rule === "string"
            ? recBody.rule
            : "";
      const ruleKind = ruleKindRaw.trim().toLowerCase().replace(/\s+/g, "_");
      if (!ruleKind) return jsonErr("invalid", 400);
      const payloadObj = rec(recBody.payload) ?? recBody;
      if (ruleKind === "vat") {
        const bps = asInt(payloadObj.vat_rate_bps ?? recBody.vat_rate_bps);
        if (bps == null || bps < 0) return jsonErr("invalid", 400);
        await asStaff(env, claims, async (tx) => {
          await tx`
            update public.rate_versions
               set vat_rate_bps = ${bps}
             where id = ${versionId} and status = 'draft'
          `;
          return null;
        });
        const next = await loadRateBook(env, claims, versionId);
        if (!next) return jsonErr("not-found", 404);
        const zones = await loadServiceZones(env, claims);
        return jsonOk(bookPayload(next, zones));
      }
      const payload = JSON.stringify({
        hours: payloadObj.hours ?? recBody.quoteLockHours ?? recBody.quote_lock_hours ?? null,
        ...payloadObj,
      });
      if (ruleKind === "quote_lock" || ruleKind === "lock") {
        const minutes = quoteLockMinutesFromHours(
          payloadObj.hours ?? recBody.quoteLockHours ?? recBody.quote_lock_hours,
        );
        if (minutes != null) {
          await asStaff(env, claims, async (tx) => {
            await tx`
              update public.rate_versions
                 set quote_lock_minutes = ${minutes}
               where id = ${versionId} and status = 'draft'
            `;
            return null;
          });
        }
      }
      await asStaff(env, claims, async (tx) => {
        if (id != null) {
          await tx`
            update public.rate_version_rules set
              kind = ${ruleKind},
              payload = ${payload}::jsonb
            where id = ${id} and rate_version_id = ${versionId}
          `;
        } else {
          await tx`
            insert into public.rate_version_rules (rate_version_id, kind, payload)
            values (${versionId}, ${ruleKind}, ${payload}::jsonb)
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
    const origin =
      (typeof recBody.originZoneId === "string" && recBody.originZoneId
        ? zones.find((z) => z.id === recBody.originZoneId)
        : matchZone(zones, recBody.from)) ??
      (await ensureMapboxZone(
        env,
        claims,
        zones,
        recBody.fromMapbox ?? recBody.from_mapbox_id ?? recBody.originMapbox,
        recBody.from,
      ));
    const dest =
      (typeof recBody.destZoneId === "string" && recBody.destZoneId
        ? zones.find((z) => z.id === recBody.destZoneId)
        : matchZone(zones, recBody.to)) ??
      (await ensureMapboxZone(
        env,
        claims,
        zones,
        recBody.toMapbox ?? recBody.to_mapbox_id ?? recBody.destMapbox,
        recBody.to,
      ));
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

  const { env } = getCloudflareContext();
  const versionId = await resolveWritableVersionId(
    env,
    claims,
    recBody?.versionId ?? url.searchParams.get("versionId"),
  );
  if (versionId == null) return jsonErr("not-found", 404);

  const table =
    kind === "surcharge"
      ? "surcharges"
      : kind === "band"
        ? "distance_bands"
        : kind === "rule"
            ? "rate_version_rules"
            : kind === "coupon"
              ? "coupons"
              : kind === "route"
                ? "fixed_routes"
                : kind === "distance"
                  ? "distance_rates"
                  : null;
  if (!table) return jsonErr("invalid", 400);

  try {
    await asStaff(env, claims, async (tx) => {
      if (table === "coupons") {
        await tx`
          delete from public.coupons
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else if (table === "surcharges") {
        await tx`
          delete from public.surcharges
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else if (table === "distance_bands") {
        await tx`
          delete from public.distance_bands
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else if (table === "rate_version_rules") {
        await tx`
          delete from public.rate_version_rules
          where id = ${id} and rate_version_id = ${versionId}
        `;
      } else if (table === "fixed_routes") {
        await tx`
          delete from public.fixed_routes
          where rate_version_id = ${versionId}
            and (origin_zone_id, dest_zone_id) in (
              select origin_zone_id, dest_zone_id
                from public.fixed_routes
               where id = ${id} and rate_version_id = ${versionId}
            )
        `;
      } else {
        await tx`
          delete from public.distance_rates
          where id = ${id} and rate_version_id = ${versionId}
        `;
      }
      return null;
    });
    const next = await loadRateBook(env, claims, versionId);
    if (!next) return jsonErr("not-found", 404);
    const zones = await loadServiceZones(env, claims);
    return jsonOk(bookPayload(next, zones));
  } catch (err) {
    return failWrite(err);
  }
});

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
