// apps/web/lib/pricing/home-fleet-from-quote.test.ts
//
// Public home fleet is the live fare book, not a hardcoded four-class ladder.
// A class deleted from /pricing must not keep a card on the front page.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const home = readFileSync(
  join(here, "../../../../app/home/home.dc.html"),
  "utf8",
);

describe("home hands the trip to checkout and never prices", () => {
  it("does not fetch the fleet, keep a class ladder or invent hold cards", () => {
    expect(home).not.toMatch(/\/api\/quote/);
    expect(home).not.toMatch(/VEHICLE_CLASSES\s*=\s*\[/);
    expect(home).not.toMatch(/kind: 'hold'/);
    expect(home).toMatch(/location\.assign\(prefix \+ '\/checkout\?'/);
  });

  it("requires a flight number on airport pickup and leaves other trips optional", () => {
    expect(home).toMatch(/flightRequired\(\) \{ return this\.state\.mode === 'one-way'; \}/);
    expect(home).not.toMatch(/flightRequired\(\) \{ return false; \}/);
    expect(home).toMatch(/flightMissing\(\) \{ return this\.flightRequired\(\) && !this\.flightFilled\(\); \}/);
    expect(home).toMatch(/flightNeed:'Enter a flight number'/);
    expect(home).toMatch(/flightNeed:'Geben Sie die Flugnummer ein'/);
    expect(home).toMatch(/flightNeed:'Saisissez le numéro de vol'/);
    expect(home).toMatch(/flightNeed:'أدخل رقم الرحلة'/);
  });

  it("does not starve Mapbox typeahead with a five-row Swiss locHits merge", () => {
    expect(home).toMatch(/if \(geo\.length\) return geo\.slice\(0, 10\)/);
    expect(home).toMatch(/\.slice\(0, 10\)/);
    expect(home).not.toMatch(/filter\(\(l\) => l && l\.n\)\.slice\(0, 5\)/);
    expect(home).toMatch(/ql\.length >= 2/);
    expect(home).toMatch(/GEO_LANGS\[this\.state\.lang\]/);
    expect(home).not.toMatch(/\(extra \|\| \[\]\)\.concat\(loc\)\.slice\(0, 5\)/);
  });
});
