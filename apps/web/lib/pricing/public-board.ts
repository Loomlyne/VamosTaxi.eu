// Live-book public class board (D-29 D-31 D-32). Idle home cards come from
// this list — not a hardcoded Economy/Business/First/Van ladder.
// Amounts stay null until POST /api/quote prices a trip. Never invent CHF.

import { photoUrl } from "../ops/photos";
import { evaluateEligibility } from "./eligibility";
import type { ClassBoardEntry, QuoteInput, RateBook, VehicleClassRow } from "./types";

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
