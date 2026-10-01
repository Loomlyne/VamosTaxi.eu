// apps/web/tests/unit/van-luxury-12-mocks.test.ts
//
// Quick 261001: Van luxury takes up to 12 travellers. No traveller 8 is left in the home form, the phone
// sheet or the dashboard New trip; home takes the limit from the class rows (GET /api/quote, one request
// shared with How it works) and hands it to the sheet.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), "../../app", rel), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");

const homeRaw = read("home/home.dc.html");
const sheetRaw = read("home/BookingSheet.dc.html");
const howRaw = read("home/HowItWorks.dc.html");
const opsRaw = read("ops/OpsNewTrip.dc.html");
const home = strip(homeRaw);
const sheet = strip(sheetRaw);
const how = strip(howRaw);
const ops = strip(opsRaw);

/** Source of a top-level `function name(...) { ... }` that closes with a `}` in column 0. */
function topLevelFunction(src: string, name: string): string {
  const m = src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`));
  if (!m) throw new Error(`function ${name} not found`);
  return m[0];
}

describe("no traveller 8 left (quick 261001)", () => {
  it.each([
    ["home.dc.html", home],
    ["BookingSheet.dc.html", sheet],
    ["OpsNewTrip.dc.html", ops],
  ])("%s has no Math.min(8 and no >= 8", (_name, src) => {
    expect(src).not.toContain("Math.min(8");
    expect(src).not.toMatch(/>=\s*8\b/);
  });
});

describe("home reads the limit from the class rows", () => {
  it("reads the board once, derives the cap and passes it to the phone sheet", () => {
    expect(home).toContain("idleBoard()");
    expect(home).toContain("boardPartyCap(");
    expect(home).toContain('paxMax="{{ paxMaxN }}"');
    expect(home).toContain("paxMaxN: paxCapN");
    expect(home).toMatch(/const PARTY_LIMIT = 16;/);
  });

  it("every stepper, hand-off and clamp uses the cap, not a number", () => {
    expect(home).toContain("Math.min(this.paxMax(),");
    expect(home).toContain("Math.min(s.paxCap >= 1 ? s.paxCap : PARTY_LIMIT,");
    expect(home).toContain("paxAtMax: paxN >= paxCapN");
  });

  it("stops listening once unmounted", () => {
    expect(home).toContain("this._alive = true;");
    expect(home).toContain("this._alive = false;");
  });
});

describe("one GET /api/quote per page", () => {
  it.each([
    ["home.dc.html", home],
    ["HowItWorks.dc.html", how],
  ])("%s fetches the idle list only inside idleBoard()", (_name, src) => {
    expect(src.match(/fetch\('\/api\/quote'/g)).toHaveLength(1);
    expect(topLevelFunction(src, "idleBoard")).toContain("fetch('/api/quote'");
  });

  it("both files share the same window slot, so the page makes one request", () => {
    const a = topLevelFunction(home, "idleBoard");
    const b = topLevelFunction(how, "idleBoard");
    expect(a).toBe(b);
    expect(a).toContain("window.__vamosIdleBoard");
  });

  it("How it works loads its pay classes through the shared helper", () => {
    expect(how).toContain("idleBoard()");
    expect(how).toMatch(/loadPayClasses\(\) \{\s*this\._payOn = true;\s*idleBoard\(\)/);
  });
});

describe("BookingSheet takes the limit as a prop", () => {
  it("declares paxMax in data-props and lifts the pax prop's max to the database 16", () => {
    expect(sheetRaw).toContain("&quot;paxMax&quot;:{&quot;editor&quot;:&quot;int&quot;,&quot;default&quot;:16,&quot;min&quot;:1,&quot;max&quot;:16");
    expect(sheetRaw).toContain("&quot;pax&quot;:{&quot;editor&quot;:&quot;int&quot;,&quot;default&quot;:1,&quot;min&quot;:1,&quot;max&quot;:16");
  });

  it("clamps pax to the cap and stops the + button there", () => {
    expect(sheet).toContain("Math.min(16, Math.floor(+p.paxMax))");
    expect(sheet).toContain("const pax = Math.min(cap,");
    expect(sheet).toContain("paxAtMax: pax >= cap");
  });
});

describe("dashboard New trip has no silent clamp", () => {
  it("sends the number typed; the quote's class rows decide", () => {
    expect(ops).toContain("pax: Math.max(1, parseInt(this.state.pax, 10) || 1),");
  });
});

describe("boardPartyCap (evaluated from home.dc.html)", () => {
  const limit = Number(homeRaw.match(/const PARTY_LIMIT = (\d+);/)?.[1]);
  const boardPartyCap = new Function(
    "PARTY_LIMIT",
    `${topLevelFunction(homeRaw, "boardPartyCap")}\nreturn boardPartyCap;`,
  )(limit) as (j: unknown) => number | null;

  const live = (vanEligible = true) => ({
    ok: true,
    classes: [
      { slug: "saden", eligible: true, effective_max_pax: 3 },
      { slug: "mercedes-benz-v-class", eligible: true, effective_max_pax: 7 },
      { slug: "van-luxury", eligible: vanEligible, effective_max_pax: 12 },
    ],
  });

  it("the fallback is the database limit 16", () => {
    expect(limit).toBe(16);
  });

  it("live-like list: the most seats among the bookable classes", () => {
    expect(boardPartyCap(live())).toBe(12);
    expect(boardPartyCap(live(false))).toBe(7);
  });

  it("no list, a refused list or a list without seats gives null", () => {
    expect(boardPartyCap({ ok: false })).toBeNull();
    expect(boardPartyCap(null)).toBeNull();
    expect(boardPartyCap(undefined)).toBeNull();
    expect(boardPartyCap({ ok: true })).toBeNull();
    expect(boardPartyCap({ ok: true, classes: [] })).toBeNull();
    expect(boardPartyCap({ ok: true, classes: [{ eligible: true, effective_max_pax: "x" }] })).toBeNull();
  });

  it("never goes above the database limit", () => {
    expect(boardPartyCap({ ok: true, classes: [{ eligible: true, effective_max_pax: 20 }] })).toBe(16);
  });
});

// The Arabic wording for 11 to 99 travellers runs through the real runtime in locale-pattern-switch.test.ts.
