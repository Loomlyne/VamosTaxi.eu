// apps/web/lib/checkout/party-cap.test.ts
//
// The Edit trip counter on /checkout stops at the most seats among the quoted classes that a
// party could book apart from its size. Seats come from the class rows (effective_max_pax).

import { describe, expect, it } from "vitest";
import { partyCap } from "./party-cap";
import { PAX_MAX } from "./trip-url";
import type { ClassBlock } from "./checkout-quote";

type Row = { pax: number; block: ClassBlock | null };

const rows = (economy: ClassBlock | null, business: ClassBlock | null, van: ClassBlock | null): Row[] => [
  { pax: 3, block: economy },
  { pax: 7, block: business },
  { pax: 12, block: van },
];

describe("partyCap", () => {
  it("is the most seats among the classes: Economy 3, Business 7, Van luxury 12 -> 12", () => {
    expect(partyCap(rows(null, null, null))).toBe(12);
  });

  it("counts classes blocked only by party size: 10 travellers -> Economy and Business 'pax', Van free -> 12", () => {
    expect(partyCap(rows("pax", "pax", null))).toBe(12);
  });

  it("counts classes blocked only by luggage", () => {
    expect(partyCap(rows("bags", "bags", "bags"))).toBe(12);
  });

  it("ignores a class no party size would make bookable: Van unavailable -> 7", () => {
    expect(partyCap(rows(null, null, "unavailable"))).toBe(7);
    expect(partyCap(rows(null, null, "no_rate"))).toBe(7);
    expect(partyCap(rows(null, null, "route_off"))).toBe(7);
  });

  it("is null when there is no quote or no class can be booked", () => {
    expect(partyCap([])).toBeNull();
    expect(partyCap(null)).toBeNull();
    expect(partyCap(undefined)).toBeNull();
    expect(partyCap(rows("unavailable", "no_rate", "route_off"))).toBeNull();
    expect(partyCap([{ pax: 0, block: null }])).toBeNull();
  });

  it("never goes above the database limit on a leg", () => {
    expect(PAX_MAX).toBe(16);
    expect(partyCap([{ pax: 20, block: null }])).toBe(16);
  });
});
