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

describe("home hands the trip to checkout and prices only from the server quote", () => {
  it("keeps no class ladder, no hold cards and no amount in markup", () => {
    expect(home).not.toMatch(/VEHICLE_CLASSES\s*=\s*\[/);
    expect(home).not.toMatch(/kind: 'hold'/);
    expect(home).toMatch(/location\.assign\(prefix \+ '\/checkout\?'/);
    // Every CHF figure the class cards show goes through the locale runtime from the server's rappen.
    expect(home).toMatch(/loc\.fromChf\(c\.total\)/);
    expect(home).not.toMatch(/data-cc-price[^>]*>\s*CHF\s*\d/);
  });

  it("quotes only on the laptop, only once From, To and When are valid, debounced, once per trip, at most 4 a minute (26.4.2)", () => {
    // The one POST lives in ccFire; ccSync guards it.
    expect((home.match(/fetch\('\/api\/quote', \{ method: 'POST'/g) ?? []).length).toBe(1);
    expect(home).toMatch(/ccSync\(\) \{[\s\S]*?if \(s\.narrow\) \{ this\.ccReset\(\); return; \}/);
    expect(home).toMatch(/const body = this\.ccBody\(r\);\n    if \(!body\) \{ this\.ccReset\(\); return; \}/);
    expect(home).toMatch(/if \(sig === this\._ccSig\) return;/);
    expect(home).toMatch(/setTimeout\(\(\) => this\.ccFire\(sig\), 900\)/);
    expect(home).toMatch(/this\._ccHits\.length >= 4/);
    // A class card carries the class slug to checkout.
    expect(home).toMatch(/p\.set\('class', cls\)/);
  });

  it("requires a flight number on airport pickup and leaves other trips optional", () => {
    // 26.4 D-09: the rule moved into the booking sheet: required only for an airport pickup.
    const sheet = readFileSync(join(here, "../../../../app/home/BookingSheet.dc.html"), "utf8");
    expect(sheet).toMatch(/const flightReq = !!p\.fromAirport;/);
    expect(sheet).toMatch(/flightOptional: !flightReq/);
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
