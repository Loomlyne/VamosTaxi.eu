// Live-book public class board (D-29 D-31 D-32). Idle home cards come from
// this list — not a hardcoded Economy/Business/First/Van ladder.
// Amounts stay null until POST /api/quote prices a trip. Never invent CHF.

import { photoUrl } from "../ops/photos";
import { evaluateEligibility } from "./eligibility";
import { isCantonFixed } from "./lines";
import type {
  ClassBoardEntry,
  QuoteInput,
  RateBook,
  VehicleClassRow,
  ZoneRow,
} from "./types";

const IDLE_INPUT: QuoteInput = {
  mode: "one_way",
  pax: 1,
  bags: 0,
  display_currency: "CHF",
  computed_at: "1970-01-01T00:00:00.000Z",
  legs: [],
  extras: {},
  coupon: null,
};

export function classDisplayName(
  cls: VehicleClassRow | undefined,
  slug: string,
): string {
  const typed = cls?.name?.trim();
  if (typed) return typed;
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function decoratePublicClasses(
  book: RateBook,
  classes: ClassBoardEntry[],
): ClassBoardEntry[] {
  return classes.map((entry) => {
    const cls = book.classes.find((row) => row.slug === entry.slug);
    return {
      ...entry,
      name: classDisplayName(cls, entry.slug),
      photo_url: photoUrl(cls?.photo_path ?? null),
    };
  });
}

/** Rated live-book classes for the idle home strip. Deleted (no_rate) omitted. */
export function liveBookBoard(book: RateBook): ClassBoardEntry[] {
  const board = evaluateEligibility(book, IDLE_INPUT);
  return decoratePublicClasses(
    book,
    board.classes
      .filter((entry) => entry.ineligible_reason !== "no_rate")
      .map((entry) => ({
        ...entry,
        lines: [],
        total_rappen: null,
      })),
  );
}

export type PublicCatalogRoute = {
  key: string;
  from: string;
  to: string;
  from_mapbox_id: string | null;
  to_mapbox_id: string | null;
};

function titleSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapboxIdFromTags(tags: string[] | undefined): string | null {
  for (const tag of tags ?? []) {
    if (typeof tag !== "string" || !tag.startsWith("mapbox:")) continue;
    const id = tag.slice("mapbox:".length).trim();
    if (id) return id;
  }
  return null;
}

function zonePublicLabel(
  zone: ZoneRow | undefined,
  fallback: string,
  names?: ReadonlyMap<string, string>,
): string {
  const named = zone ? names?.get(zone.slug)?.trim() : "";
  const name = named || (zone ? titleSlug(zone.slug) : titleSlug(fallback));
  const iata = zone?.iata?.trim().toUpperCase();
  if (iata && !name.includes(`(${iata})`)) return `${name} (${iata})`;
  return name;
}

/** Unique live place→place rows for the home Fixed routes tab. */
export function publicCatalogRoutes(
  book: RateBook,
  names?: ReadonlyMap<string, string>,
): PublicCatalogRoute[] {
  const byId = new Map(book.zones.map((zone) => [zone.id, zone]));
  const seen = new Set<string>();
  const out: PublicCatalogRoute[] = [];
  for (const row of book.fixed_routes) {
    if (!row.live) continue;
    if (isCantonFixed(row, byId)) continue;
    const key = `${row.origin_zone_id}::${row.dest_zone_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const origin = byId.get(row.origin_zone_id);
    const dest = byId.get(row.dest_zone_id);
    out.push({
      key,
      from: zonePublicLabel(origin, row.origin_zone_id, names),
      to: zonePublicLabel(dest, row.dest_zone_id, names),
      from_mapbox_id: mapboxIdFromTags(origin?.tags),
      to_mapbox_id: mapboxIdFromTags(dest?.tags),
    });
  }
  return out;
}
