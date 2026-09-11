// apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
//
// GET  /api/staff/rate-book?versionId= — hydrate 06-02 collections (routes/rates/surcharges).
// PUT  /api/staff/rate-book — upsert { kind: "route" | "distance" | "surcharge" }.
// Missing version → JSON 404. Unauthenticated → JSON 401. No CHF literals. No postgres.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { loadRateVersions } from "@/lib/ops/pricing";
import {
  assertDistanceRateInput,
  assertFixedRouteInput,
  assertSurchargeInput,
  classifyPricingFailure,
  loadRateBook,
  loadServiceZones,
  RateBookInputError,
  type DistanceRateInput,
  type DistanceRateRow,
  type FixedRouteInput,
  type FixedRouteRow,
  type RateBook,
  type ServiceZoneRow,
  type SurchargeInput,
  type SurchargeKind,
} from "@/lib/ops/rate-book";
import { extraWriteFields, isPassengerExtra, normalizeSurchargeCode } from "@/lib/ops/surcharge-codes";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

const CLASS_KEYS = ["economy", "business", "first", "van"] as const;
type ClassKey = (typeof CLASS_KEYS)[number];

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

function moneyFromRappen(rappen: number | null): {
  CHF: string;
  EUR: string;
  USD: string;
  AED: string;
} {
  const chf = rappen == null ? "" : String(rappen / 100);
  return { CHF: chf, EUR: "", USD: "", AED: "" };
}

function isPlaceholderAmount(raw: string): boolean {
  return raw === "" || raw === "000" || raw === "00" || raw === "0.00" || raw === "—" || raw === "–";
}

function rappenFromUnknown(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value === 0) return null;
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (isPlaceholderAmount(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n * 100);
}

function rappenFromMoneySet(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") return rappenFromUnknown(value);
  const obj = rec(value);
  if (!obj) return null;
  if ("CHF" in obj) return rappenFromUnknown(obj.CHF);
  return null;
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

function klassSlug(value: unknown): ClassKey | "" {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "economy" || raw === "business" || raw === "first" || raw === "van") return raw;
  return "";
}

function klassLabel(slug: string): string {
  if (slug === "economy") return "Economy";
  if (slug === "business") return "Business";
  if (slug === "first") return "First";
  if (slug === "van") return "Van";
  return slug;
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
  return zones.find((z) => zoneDisplay(z) === raw);
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
    const byClass = new Map(rows.map((r) => [r.vehicleClassSlug, r]));
    out.push({
      id: String(first.id),
      from: origin ? zoneDisplay(origin) : first.originSlug,
      to: dest ? zoneDisplay(dest) : first.destSlug,
      originZoneId: first.originZoneId,
      destZoneId: first.destZoneId,
      economy: moneyFromRappen(byClass.get("economy")?.priceRappen ?? null),
      business: moneyFromRappen(byClass.get("business")?.priceRappen ?? null),
      first: moneyFromRappen(byClass.get("first")?.priceRappen ?? null),
      van: moneyFromRappen(byClass.get("van")?.priceRappen ?? null),
      live: rows.some((r) => r.live),
    });
  }
  return out;
}

function mockRates(book: RateBook): Record<string, unknown>[] {
  return book.distanceRates.map((row) => ({
    id: String(row.id),
    klass: klassLabel(row.vehicleClassSlug),
    vehicleClassId: row.vehicleClassId,
    baseFare: moneyFromRappen(row.baseFareRappen),
    perKm: moneyFromRappen(row.perKmRappen),
    minFare: moneyFromRappen(row.minFareRappen),
    maxPax: row.maxPax,
    available: row.available,
  }));
}

function mockSurcharges(book: RateBook): Record<string, unknown>[] {
  return book.surcharges.map((row) => ({
    id: String(row.id),
    code: row.code,
    label: row.code,
    rule: row.appliesTo,
    kind: row.kind,
    amounts: moneyFromRappen(row.amountRappen),
    pct: row.percent == null ? "" : String(row.percent),
    appliesTo: row.appliesTo,
    active: row.active,
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
  };
}

async function resolveVersionId(
  env: CloudflareEnv,
  claims: Parameters<typeof loadRateVersions>[1],
  raw: unknown,
): Promise<number | null> {
  const parsed = optionalId(raw) ?? asInt(raw);
  if (parsed != null && parsed > 0) return parsed;
  const versions = await loadRateVersions(env, claims);
  const live = versions.find((row) => row.status === "live");
  if (live) return live.id;
  const draft = versions.find((row) => row.status === "draft");
  return draft ? draft.id : null;
}

function failWrite(err: unknown): Response {
  if (err instanceof RateBookInputError) return jsonErr(err.key, 400);
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
    case "fk":
      return jsonErr("fk", 400);
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
      : (classes.find((c) => c.slug === slug)?.id ?? "");
  const maxPax = asInt(body.maxPax);
  return {
    vehicleClassId,
    baseFareRappen:
      body.baseFareRappen !== undefined ? rappenFromUnknown(body.baseFareRappen) : rappenFromMoneySet(body.baseFare),
    perKmRappen:
      body.perKmRappen !== undefined ? rappenFromUnknown(body.perKmRappen) : rappenFromMoneySet(body.perKm),
    minFareRappen:
      body.minFareRappen !== undefined ? rappenFromUnknown(body.minFareRappen) : rappenFromMoneySet(body.minFare),
    maxPax: maxPax ?? 1,
    available: boolish(body.available, true),
  };
}

function parseSurchargeInput(body: Record<string, unknown>): SurchargeInput {
  const raw =
    typeof body.code === "string" && body.code
      ? body.code
      : typeof body.label === "string"
        ? body.label
        : "";
  const code = raw ? normalizeSurchargeCode(raw) : "";
  const kindRaw = typeof body.kind === "string" ? body.kind : "amount";
  const kind: SurchargeKind =
    kindRaw === "percent" || kindRaw === "included" || kindRaw === "amount" ? kindRaw : "amount";
  const appliesRaw = typeof body.appliesTo === "string" ? body.appliesTo : typeof body.rule === "string" ? body.rule : "leg";
  return {
    code,
    kind,
    amountRappen:
      body.amountRappen !== undefined ? rappenFromUnknown(body.amountRappen) : rappenFromMoneySet(body.amounts),
    percent: body.percent !== undefined ? percentFromUnknown(body.percent) : percentFromUnknown(body.pct),
    appliesTo: appliesRaw === "booking" ? "booking" : "leg",
    active: boolish(body.active, true),
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
  const kind = recBody.kind;
  if (kind !== "route" && kind !== "distance" && kind !== "surcharge") {
    return jsonErr("invalid", 400);
  }

  const { env } = getCloudflareContext();
  const versionId = await resolveVersionId(env, claims, recBody.versionId);
  if (versionId == null) return jsonErr("not-found", 404);
  const id = optionalId(recBody.id);

  try {
    if (kind === "distance") {
      const book = await loadRateBook(env, claims, versionId);
      if (!book) return jsonErr("not-found", 404);
      const classes = uniqueClasses(book.distanceRates);
      const parsed = assertDistanceRateInput(parseDistanceInput(recBody, classes));
      const existing =
        id != null
          ? book.distanceRates.find((row) => row.id === id)
          : book.distanceRates.find((row) => row.vehicleClassId === parsed.vehicleClassId);
      await asStaff(env, claims, async (tx) => {
        if (existing) {
          await tx`
            update public.distance_rates set
              vehicle_class_id = ${parsed.vehicleClassId},
              base_fare_rappen = ${parsed.baseFareRappen},
              per_km_rappen = ${parsed.perKmRappen},
              min_fare_rappen = ${parsed.minFareRappen},
              max_pax = ${parsed.maxPax},
              available = ${parsed.available}
            where id = ${existing.id} and rate_version_id = ${versionId}
          `;
        } else {
          await tx`
            insert into public.distance_rates (
              rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen,
              min_fare_rappen, max_pax, available
            ) values (
              ${versionId}, ${parsed.vehicleClassId}, ${parsed.baseFareRappen},
              ${parsed.perKmRappen}, ${parsed.minFareRappen}, ${parsed.maxPax},
              ${parsed.available}
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
        payload.rates.find((row) => row.vehicleClassId === parsed.vehicleClassId) ?? payload.rates[0];
      return jsonOk(saved ?? payload);
    }

    if (kind === "surcharge") {
      const parsed = assertSurchargeInput(parseSurchargeInput(recBody));
      const extras = isPassengerExtra(parsed.code) ? extraWriteFields(parsed.code) : null;
      await asStaff(env, claims, async (tx) => {
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
                quantity_source = ${extras.quantitySource}
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
                active = ${parsed.active}
              where id = ${id} and rate_version_id = ${versionId}
            `;
          }
        } else if (extras) {
          await tx`
            insert into public.surcharges (
              rate_version_id, code, kind, amount_rappen, percent, applies_to, active,
              predicate, quantity_source
            ) values (
              ${versionId}, ${parsed.code}, ${parsed.kind}, ${parsed.amountRappen},
              ${parsed.percent}, ${parsed.appliesTo}, ${parsed.active},
              ${JSON.stringify(extras.predicate)}::jsonb, ${extras.quantitySource}
            )
          `;
        } else {
          await tx`
            insert into public.surcharges (
              rate_version_id, code, kind, amount_rappen, percent, applies_to, active
            ) values (
              ${versionId}, ${parsed.code}, ${parsed.kind}, ${parsed.amountRappen},
              ${parsed.percent}, ${parsed.appliesTo}, ${parsed.active}
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

    const book = await loadRateBook(env, claims, versionId);
    if (!book) return jsonErr("not-found", 404);
    const zones = await loadServiceZones(env, claims);
    const origin =
      typeof recBody.originZoneId === "string" && recBody.originZoneId
        ? zones.find((z) => z.id === recBody.originZoneId)
        : matchZone(zones, recBody.from);
    const dest =
      typeof recBody.destZoneId === "string" && recBody.destZoneId
        ? zones.find((z) => z.id === recBody.destZoneId)
        : matchZone(zones, recBody.to);
    if (!origin || !dest) throw new RateBookInputError("rateBook.error-route-required");
    const live = boolish(recBody.live, false);
    const classPrices: { slug: ClassKey; price: number | null }[] = CLASS_KEYS.map((slug) => ({
      slug,
      price:
        recBody.priceRappen !== undefined && typeof recBody.vehicleClassId === "string"
          ? rappenFromUnknown(recBody.priceRappen)
          : rappenFromMoneySet(recBody[slug]),
    }));
    const nativeClassId = typeof recBody.vehicleClassId === "string" ? recBody.vehicleClassId : "";
    const targets =
      nativeClassId && recBody.priceRappen !== undefined
        ? [{ vehicleClassId: nativeClassId, slug: klassSlug(recBody.vehicleClassSlug) || "economy", price: rappenFromUnknown(recBody.priceRappen) }]
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
  if (kind !== "surcharge" || id == null) return jsonErr("invalid", 400);

  const { env } = getCloudflareContext();
  const versionId = await resolveVersionId(env, claims, recBody?.versionId ?? url.searchParams.get("versionId"));
  if (versionId == null) return jsonErr("not-found", 404);

  try {
    await asStaff(env, claims, async (tx) => {
      await tx`
        delete from public.surcharges
        where id = ${id} and rate_version_id = ${versionId}
      `;
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

function uniqueClasses(rows: DistanceRateRow[]): { id: string; slug: string }[] {
  const seen = new Map<string, { id: string; slug: string }>();
  for (const row of rows) {
    if (!seen.has(row.vehicleClassId)) {
      seen.set(row.vehicleClassId, { id: row.vehicleClassId, slug: row.vehicleClassSlug });
    }
  }
  return [...seen.values()];
}

function classIdFor(distance: DistanceRateRow[], routes: FixedRouteRow[], slug: ClassKey): string {
  const fromDistance = distance.find((row) => row.vehicleClassSlug === slug);
  if (fromDistance) return fromDistance.vehicleClassId;
  const fromRoute = routes.find((row) => row.vehicleClassSlug === slug);
  return fromRoute?.vehicleClassId ?? "";
}
