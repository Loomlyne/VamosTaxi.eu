// apps/web/lib/checkout/home-saved-places.test.ts
//
// The saved places on the home box must be exact places. A saved row without a Mapbox id went to
// /checkout as words, and the words priced Zug at a moving company in Zurich (2026-10-30 finding).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../../../../app/home/home.dc.html"), "utf8");

function block(from: string, to: string): string {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

type Saved = { id: string; n: string; air?: boolean; mapbox_id?: string };
const LOCS = new Function(`${block("const LOCS = [", "function locHits(")}; return LOCS;`)() as Saved[];

describe("saved places on the home box", () => {
  it("every row names one exact Mapbox place", () => {
    expect(LOCS.length).toBeGreaterThan(0);
    for (const row of LOCS) expect(row.mapbox_id, row.id).toMatch(/^dXJuOm1i[A-Za-z0-9_-]+$/);
  });
  it("no two rows point at the same place", () => {
    const ids = LOCS.map((row) => row.mapbox_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("a picked row carries its id and session to the trip", () => {
    const hit = block("function locHit(l) {", "/** Empty field:");
    expect(hit).toContain("mapbox_id: l.mapbox_id");
    expect(hit).toContain("session_token: geoSession()");
  });
  it("where we drive can fill every airport it names from a saved place", () => {
    const code = new Function(`${block("const SAVED_AIRPORT = ", "const POPULAR_IDS")}; return SAVED_AIRPORT;`)() as Record<string, string>;
    for (const [iata, id] of Object.entries(code)) {
      const row = LOCS.find((l) => l.id === id);
      expect(row?.air, iata).toBe(true);
      expect(row?.mapbox_id, iata).toBeTruthy();
    }
  });
  it("the box refuses a place with no id, so words never reach /checkout", () => {
    const check = block("const pl = s.pickupLoc, dl = s.dropLoc;", "const air = this.pickupAir();");
    expect(check).toContain("!pl.mapbox_id");
    expect(check).toContain("!dl.mapbox_id");
  });
});
