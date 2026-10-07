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

describe("home hands the trip to checkout and shows no class section or price", () => {
  it("keeps no class ladder, no hold cards and no class section in markup", () => {
    expect(home).not.toMatch(/VEHICLE_CLASSES\s*=\s*\[/);
    expect(home).not.toMatch(/kind: 'hold'/);
    expect(home).toMatch(/location\.assign\(prefix \+ '\/checkout\?'/);
    // The class choice lives on /checkout only (owner, 2026-09-30).
    expect(home).not.toMatch(/data-cc/);
    expect(home).not.toMatch(/loc\.fromChf/);
  });

  it("posts no quote from the home page", () => {
    expect(home).not.toMatch(/method: 'POST'[^\n]*quote|\/api\/quote[^\n]*method: 'POST'/);
    expect(home).not.toMatch(/ccFire|ccSync/);
  });

  it("shows the flight number on every trip and never requires it", () => {
    // Owner change 2026-10-07: the flight field is always visible and always optional, airport pickup included.
    const sheet = readFileSync(join(here, "../../../../app/home/BookingSheet.dc.html"), "utf8");
    expect(sheet).toMatch(/const flightReq = false;/);
    expect(sheet).toMatch(/flightOptional: !flightReq/);
    expect(sheet).toMatch(/_flightVisible\(p\) \{ return true; \}/);
    expect(sheet).not.toMatch(/Enter the flight number/);
    // checkTrip still checks the format of a typed number, and no longer asks for a missing one.
    expect(home).not.toMatch(/errs\.flight = 'Enter the flight number'/);
    expect(home).toMatch(/errs\.flight = 'Check the flight number'/);
    expect(home).toMatch(/const showFlightField = true;/);
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
