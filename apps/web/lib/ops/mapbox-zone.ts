// apps/web/lib/ops/mapbox-zone.ts
//
// D-20 / D-26: a Mapbox From/To is a real place. Ops does not wait for a
// pre-seeded service_zones row. Slug + tags are derived here; the staff
// INSERT lives with the rate-book write.
//
// D-10 (26.1-10): the zone a pick creates is an official area, never the
// street or point of interest itself — the city it sits in (tag
// mapbox_place:<id>), the canton for a region pick (canton-<code>), or the
// airport for an airport POI (tag mapbox:<id>). No resolved area, no zone.

import type { GeoLanguage, RetrievedPlace } from "../geo/mapbox";

export function mapboxIdFromPin(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const rec = value as Record<string, unknown>;
  if (typeof rec.mapbox_id === "string" && rec.mapbox_id.trim() !== "") {
    return rec.mapbox_id.trim();
  }
  if (typeof rec.mapboxId === "string" && rec.mapboxId.trim() !== "") {
    return rec.mapboxId.trim();
  }
  return "";
}

export function placeLabelFromPin(value: unknown, fallback: unknown): string {
  if (typeof fallback === "string" && fallback.trim() !== "") return fallback.trim();
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const rec = value as Record<string, unknown>;
  if (typeof rec.text === "string" && rec.text.trim() !== "") return rec.text.trim();
  if (typeof rec.name === "string" && rec.name.trim() !== "") return rec.name.trim();
  return "";
}

export function zoneSlugFromPlace(label: string, mapboxId: string): string {
  const fromName = label
    .toLowerCase()
    .normalize("NFKD")
    // Drop the combining marks NFKD split off, so "Zürich" is "zurich", not "zu-rich".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (fromName.length >= 2) return fromName;
  const id = mapboxId.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32);
  return id ? `mbx-${id}` : "place";
}

export function skiZoneType(label: string): "ski" | "other" {
  return /zermatt|verbier|st\.?\s*moritz|chamonix|davos|klosters/i.test(label)
    ? "ski"
    : "other";
}

export function pgTextArrayLiteral(values: string[]): string {
  if (values.length === 0) return "{}";
  return `{${values
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

/**
 * The 26 cantons and their official proper names — the same list migration
 * 20260928130000_canton_city_zones.sql seeds as canton-<code> zones.
 */
const CANTON_NAMES: Readonly<Record<string, string>> = Object.freeze({
  AG: "Aargau",
  AI: "Appenzell Innerrhoden",
  AR: "Appenzell Ausserrhoden",
  BE: "Bern",
  BL: "Basel-Landschaft",
  BS: "Basel-Stadt",
  FR: "Fribourg",
  GE: "Genève",
  GL: "Glarus",
  GR: "Graubünden",
  JU: "Jura",
  LU: "Luzern",
  NE: "Neuchâtel",
  NW: "Nidwalden",
  OW: "Obwalden",
  SG: "St. Gallen",
  SH: "Schaffhausen",
  SO: "Solothurn",
  SZ: "Schwyz",
  TG: "Thurgau",
  TI: "Ticino",
  UR: "Uri",
  VD: "Vaud",
  VS: "Valais",
  ZG: "Zug",
  ZH: "Zürich",
});

/** The Swiss canton code for a Mapbox region code, or null when it is not one of the 26. */
export function swissCantonCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/^CH-/, "");
  return Object.prototype.hasOwnProperty.call(CANTON_NAMES, code) ? code : null;
}

export type ZoneKind = "city" | "canton" | "airport";

/** What a Mapbox pick becomes in service_zones (D-10). */
export type ZoneTarget = {
  kind: ZoneKind;
  /** Preferred slug: the area's name. */
  slug: string;
  /** Used when `slug` already belongs to a different area (two Swiss towns share a name). */
  altSlug: string;
  /** City zones keep the ski class for ski towns so the ski surcharge predicate still fires. */
  zoneType: "city" | "ski" | "canton" | "airport";
  tags: string[];
  /** The tag that identifies this area; reuse is by this tag first. */
  identityTag: string;
  /** Proper name stored as the non-translatable zone.<slug> display string. */
  name: string;
};

export type RetrievedZonePlace = Pick<
  RetrievedPlace,
  "mapbox_id" | "name" | "canton" | "cityId" | "cityName" | "isAirport"
>;

function idFragment(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(-8) || "place";
}

/**
 * D-10: map a retrieved Mapbox place to the official area it sits in.
 * Airport POI → airport zone; anything inside a city → the city; a region
 * pick (no city) → its canton. Returns null when no area resolves — the
 * caller refuses the write instead of guessing a zone.
 */
export function zoneTargetFromRetrieved(
  place: RetrievedZonePlace | null | undefined,
): ZoneTarget | null {
  if (!place) return null;
  const canton = swissCantonCode(place.canton);
  const mapboxId = typeof place.mapbox_id === "string" ? place.mapbox_id.trim() : "";
  const placeName = typeof place.name === "string" ? place.name.trim() : "";

  if (place.isAirport) {
    if (!mapboxId || !placeName) return null;
    const slug = zoneSlugFromPlace(placeName, mapboxId);
    const tag = `mapbox:${mapboxId}`;
    return {
      kind: "airport",
      slug,
      altSlug: `${slug}-${idFragment(mapboxId)}`,
      zoneType: "airport",
      tags: [tag],
      identityTag: tag,
      name: placeName,
    };
  }

  const cityId = typeof place.cityId === "string" ? place.cityId.trim() : "";
  if (cityId) {
    const name = (place.cityName ?? "").trim() || placeName || cityId;
    const slug = zoneSlugFromPlace(name, cityId);
    const tag = `mapbox_place:${cityId}`;
    return {
      kind: "city",
      slug,
      altSlug: canton ? `${slug}-${canton.toLowerCase()}` : `${slug}-${idFragment(cityId)}`,
      zoneType: skiZoneType(name) === "ski" ? "ski" : "city",
      tags: [tag],
      identityTag: tag,
      name,
    };
  }

  if (canton) {
    const slug = `canton-${canton.toLowerCase()}`;
    const tag = `canton:${canton}`;
    return {
      kind: "canton",
      slug,
      altSlug: slug,
      zoneType: "canton",
      tags: [tag],
      identityTag: tag,
      name: CANTON_NAMES[canton] ?? canton,
    };
  }

  return null;
}

export type ZoneStoreRow = {
  id: string;
  slug: string;
  iata: string | null;
  active: boolean;
  tags: string[];
};

/** The four reads/writes zone resolution needs; the route backs it with one staff transaction. */
export type ZoneStore = {
  findActiveByTag(tag: string): Promise<ZoneStoreRow | null>;
  findBySlug(slug: string): Promise<ZoneStoreRow | null>;
  /** Adds the identity tag to an existing zone and makes it active. */
  tagAndActivate(id: string, tag: string): Promise<ZoneStoreRow | null>;
  /** Inserts the zone and its non-translatable display name; null when the slug is taken. */
  insert(target: ZoneTarget, slug: string): Promise<ZoneStoreRow | null>;
};

function identityPrefix(tag: string): string {
  const i = tag.indexOf(":");
  return i >= 0 ? tag.slice(0, i + 1) : tag;
}

/** True when `row` already stands for a different area of the same kind. */
function heldByAnotherArea(row: ZoneStoreRow, target: ZoneTarget): boolean {
  const prefix = identityPrefix(target.identityTag);
  return row.tags.some((t) => t.startsWith(prefix) && t !== target.identityTag);
}

/**
 * Find or create the zone for a target: reuse an active zone carrying the
 * identity tag; else reuse the zone at the slug (adding the tag) unless it
 * already stands for another area, in which case try `altSlug`; else insert.
 * Returns null when both slugs belong to other areas.
 */
export async function upsertZoneTarget(
  target: ZoneTarget,
  store: ZoneStore,
): Promise<ZoneStoreRow | null> {
  const byTag = await store.findActiveByTag(target.identityTag);
  if (byTag) return byTag;
  const slugs = target.altSlug !== target.slug ? [target.slug, target.altSlug] : [target.slug];
  for (const slug of slugs) {
    const existing = await store.findBySlug(slug);
    if (existing) {
      if (heldByAnotherArea(existing, target)) continue;
      return store.tagAndActivate(existing.id, target.identityTag);
    }
    const inserted = await store.insert(target, slug);
    if (inserted) return inserted;
    // Lost a race for the slug: read what won and apply the same rule once.
    const winner = await store.findBySlug(slug);
    if (winner && !heldByAnotherArea(winner, target)) {
      return store.tagAndActivate(winner.id, target.identityTag);
    }
  }
  return null;
}

export type ZoneResolution =
  | { ok: true; zone: ZoneStoreRow; target: ZoneTarget }
  | { ok: false; reason: "no-pin" | "retrieve-failed" | "unresolvable" | "slug-taken" };

export type ZoneResolutionDeps = {
  /** Mapbox Search Box retrieve for the picked id; null on any failure. */
  retrieve(mapboxId: string): Promise<RetrievedZonePlace | null>;
  /** Runs the store work inside one staff transaction. */
  withStore(
    fn: (store: ZoneStore) => Promise<ZoneStoreRow | null>,
  ): Promise<ZoneStoreRow | null>;
};

/**
 * D-10: resolve a Fixed-routes pick to its official zone. The Mapbox call
 * happens before any transaction opens; a failed or unresolvable retrieve
 * returns an error and never touches service_zones.
 */
export async function resolveZoneFromPin(
  pin: unknown,
  deps: ZoneResolutionDeps,
): Promise<ZoneResolution> {
  const mapboxId = mapboxIdFromPin(pin);
  if (!mapboxId) return { ok: false, reason: "no-pin" };
  let place: RetrievedZonePlace | null;
  try {
    place = await deps.retrieve(mapboxId);
  } catch {
    place = null;
  }
  if (!place) return { ok: false, reason: "retrieve-failed" };
  const target = zoneTargetFromRetrieved(place);
  if (!target) return { ok: false, reason: "unresolvable" };
  const zone = await deps.withStore((store) => upsertZoneTarget(target, store));
  if (!zone) return { ok: false, reason: "slug-taken" };
  return { ok: true, zone, target };
}

const GEO_LANGUAGES: readonly GeoLanguage[] = ["en", "de", "fr", "ar"];

function asGeoLanguage(value: string): GeoLanguage | null {
  const v = value.trim().toLowerCase();
  return (GEO_LANGUAGES as readonly string[]).includes(v) ? (v as GeoLanguage) : null;
}

/**
 * The staff locale: the route path (/de/api/staff/…) when it carries one, else the primary
 * Accept-Language tag (the unprefixed /api/staff/rate-book alias), else en. Only the display
 * name of a new zone depends on it — Mapbox ids are language-independent.
 */
export function geoLanguageFromPath(
  pathname: string,
  acceptLanguage?: string | null,
): GeoLanguage {
  const fromPath = asGeoLanguage(pathname.split("/").filter(Boolean)[0] ?? "");
  if (fromPath) return fromPath;
  const primary = (acceptLanguage ?? "").split(",")[0]?.split(";")[0]?.split("-")[0] ?? "";
  return asGeoLanguage(primary) ?? "en";
}
