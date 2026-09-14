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
});
