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

describe("home fleet follows the live fare book", () => {
  it("drops no_rate classes and does not invent hold cards for missing slugs", () => {
    expect(home).toMatch(/function publicQuoteClass/);
    expect(home).toMatch(/ineligible_reason !== 'no_rate'/);
    expect(home).toMatch(/fleetOffer/);
    expect(home).toMatch(/s\.fleetOffer \|\| \[\]/);
    expect(home).not.toMatch(/if \(!c\) \{ res\[v\.id\] = Object\.assign\(\{ kind: 'hold' \}/);
    expect(home).not.toMatch(
      /keepLive && prevResults\[v\.id\] && prevResults\[v\.id\]\.kind === 'price'/,
    );
  });

  it("loads live-book cards on first paint via GET /api/quote", () => {
    expect(home).toMatch(/loadFleet\(\)/);
    expect(home).toMatch(/fetch\('\/api\/quote', \{ headers: \{ accept: 'application\/json' \} \}/);
    expect(home).not.toMatch(/VEHICLE_CLASSES\s*=\s*\[/);
  });

  it("shows quoteErr when POST /api/quote fails instead of the idle needTrip kicker", () => {
    expect(home).toMatch(/quoteFail: true, announce: note/);
    expect(home).toMatch(/err === 'out_of_service_area'/);
    expect(home).toMatch(/err === 'route_unavailable'/);
    expect(home).toMatch(/s\.quoteFail \? \(s\.announce \|\| t\.quoteErr\) : t\.needTrip/);
    expect(home).toMatch(/routeErr:'No road route to this destination'/);
    expect(home).toMatch(/routeErr:'Kein Strassenweg zu diesem Ziel'/);
    expect(home).toMatch(/routeErr:'Pas d’itinéraire routier vers cette destination'/);
    expect(home).toMatch(/routeErr:'لا يوجد مسار بري إلى هذه الوجهة'/);
  });

  it("offers One way and Fixed routes tabs, and No road when Mapbox has no drive", () => {
    expect(home).toMatch(/id: 'one-way', label: t\.oneWay/);
    expect(home).toMatch(/id: 'fixed', label: t\.fixedRoutes/);
    expect(home).toMatch(/noRoad:'No road'/);
    expect(home).toMatch(/noRoad:'Kein Weg'/);
    expect(home).toMatch(/noRoad:'Sans route'/);
    expect(home).toMatch(/noRoad:'لا طريق'/);
    expect(home).toMatch(/cta: noRoad && !tooSmall \? t\.noRoad : t\.selectCta/);
    expect(home).toMatch(/europeErr:'We operate in Europe'/);
  });

  it("does not starve Mapbox typeahead with a five-row Swiss locHits merge", () => {
    expect(home).toMatch(/if \(geo\.length\) return geo\.slice\(0, 10\)/);
    expect(home).toMatch(/ql\.length >= 2/);
    expect(home).toMatch(/GEO_LANGS\[this\.state\.lang\]/);
    expect(home).not.toMatch(/\(extra \|\| \[\]\)\.concat\(loc\)\.slice\(0, 5\)/);
  });
});
