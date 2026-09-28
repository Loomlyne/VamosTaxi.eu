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

function hiddenPublicSlugs(book: RateBook): Set<string> {
  const byId = new Map(book.classes.map((cls) => [cls.id, cls.slug]));
  const hidden = new Set<string>();
  // 26.1-19 D-15: an admin-hidden class never reaches a public board.
  for (const cls of book.classes) if (cls.hidden_at) hidden.add(cls.slug);
  for (const rate of book.distance_rates) {
    if (rate.hide_from_public !== true) continue;
    const slug = byId.get(rate.vehicle_class_id);
    if (slug) hidden.add(slug);
  }
  return hidden;
}

/** Public class catalog omits hide_from_public. Eligibility may still label them unavailable. */
export function omitHiddenPublicClasses(
  book: RateBook,
  classes: ClassBoardEntry[],
): ClassBoardEntry[] {
  const hidden = hiddenPublicSlugs(book);
  if (hidden.size === 0) return classes;
  return classes.filter((entry) => !hidden.has(entry.slug));
}

function sortByBook(book: RateBook, entries: ClassBoardEntry[]): ClassBoardEntry[] {
  const bySlug = new Map(book.classes.map((cls) => [cls.slug, cls]));
  return [...entries].sort((a, b) => {
    const sa = bySlug.get(a.slug)?.sort_order ?? 0;
    const sb = bySlug.get(b.slug)?.sort_order ?? 0;
    if (sa !== sb) return sa - sb;
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });
}

/**
 * Idle eligibility has no legs, so a class that is only on a live fixed route
 * is labelled no_rate and the home strip drops it. It is still a live-book
 * class — paint the card, never a fare. Dark-only and unrated leftovers stay out.
 */
function liveFixedRouteIdleCards(
  book: RateBook,
  seen: ReadonlySet<string>,
): ClassBoardEntry[] {
  const out: ClassBoardEntry[] = [];
  for (const cls of book.classes) {
    if (seen.has(cls.slug) || cls.active === false) continue;
    const liveFixed = book.fixed_routes.some(
      (row) => row.vehicle_class_id === cls.id && row.live === true,
    );
    if (!liveFixed) continue;
    out.push({
      slug: cls.slug,
      eligible: true,
      ineligible_reason: null,
      effective_max_pax: cls.passenger_capacity,
      max_bags: cls.luggage_capacity,
      fixed_route: true,
      lines: [],
      total_rappen: null,
    });
  }
  return out;
}

/** Rated live-book classes for the idle home strip. Deleted leftovers omitted. Amounts stay null. */
export function liveBookBoard(book: RateBook): ClassBoardEntry[] {
  const board = evaluateEligibility(book, IDLE_INPUT);
  const inactive = new Set(
    book.classes.filter((cls) => cls.active === false).map((cls) => cls.slug),
  );
  const listed = board.classes
    .filter(
      (entry) =>
        entry.ineligible_reason !== "no_rate" && !inactive.has(entry.slug),
    )
    .map((entry) => ({
      ...entry,
      lines: [],
      total_rappen: null,
    }));
  const seen = new Set(listed.map((entry) => entry.slug));
  return decoratePublicClasses(
    book,
    omitHiddenPublicClasses(
      book,
      sortByBook(book, [...listed, ...liveFixedRouteIdleCards(book, seen)]),
    ),
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

/**
 * City-to-city pairs on the published book for the booking picker.
 * `fixed_routes.live` is the old fixed-route hide switch. A published pair
 * still belongs in this list when that flag is off — an unpriced class
 * (CHF 000) cannot be marked live without failing publish. Canton rows stay out.
 */
export function publicCatalogRoutes(
  book: RateBook,
  names?: ReadonlyMap<string, string>,
): PublicCatalogRoute[] {
  const byId = new Map(book.zones.map((zone) => [zone.id, zone]));
  const seen = new Set<string>();
  const out: PublicCatalogRoute[] = [];
  for (const row of book.fixed_routes) {
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
