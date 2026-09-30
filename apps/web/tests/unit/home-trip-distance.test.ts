// apps/web/tests/unit/home-trip-distance.test.ts
//
// Home laptop line under "Choose your class": the server's quote distance, or the words
// "No road route" when any leg has no road line. The functions live in the mock, so the
// test lifts their source out of app/home/home.dc.html and runs it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(join(process.cwd(), "../../app/home/home.dc.html"), "utf8");
const grab = (name: string) => {
  const m = home.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, "m"));
  if (!m) throw new Error(`${name} not found in home.dc.html`);
  return m[0];
};
const { ccRouteKm, ccRouteNoRoad } = new Function(
  `${grab("ccRouteKm")}\n${grab("ccRouteNoRoad")}\nreturn { ccRouteKm, ccRouteNoRoad };`,
)() as {
  ccRouteKm: (r: unknown) => string;
  ccRouteNoRoad: (r: unknown) => boolean;
};

describe("home trip distance line", () => {
  it("sums the road legs and writes one decimal", () => {
    expect(ccRouteKm({ legs: [{ distance_m: 148_230, road: true }] })).toBe("148.2");
    expect(ccRouteKm({ legs: [{ distance_m: 100_000 }, { distance_m: 18_000 }] })).toBe("118.0");
    expect(ccRouteNoRoad({ legs: [{ distance_m: 148_230, road: true }] })).toBe(false);
  });

  it("shows nothing without a route", () => {
    expect(ccRouteKm(undefined)).toBe("");
    expect(ccRouteKm({ legs: [] })).toBe("");
    expect(ccRouteNoRoad(undefined)).toBe(false);
  });

  it("any leg without a road: words, never a partial sum", () => {
    const route = { legs: [{ distance_m: 100_000, road: true }, { distance_m: 9_000, road: false }] };
    expect(ccRouteKm(route)).toBe("");
    expect(ccRouteNoRoad(route)).toBe(true);
  });

  it("the words are in the dictionary in de, fr, ar", () => {
    const dict = readFileSync(join(process.cwd(), "../../app/vamos-i18n-dict.js"), "utf8");
    expect(dict).toContain("'No road route': { de: 'Keine Strassenroute', fr: \"Pas d'itinéraire routier\", ar: 'لا يوجد طريق بري' }");
  });
});
