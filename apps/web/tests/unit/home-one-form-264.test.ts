// apps/web/tests/unit/home-one-form-264.test.ts
//
// Phase 26.4 (D-13, D-14): home holds one trip state. No modes, no ?service= reader,
// no service-driven kicker or hero photo.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raw = readFileSync(join(process.cwd(), "../../app/home/home.dc.html"), "utf8");
const home = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");

describe("home.dc.html one form (26.4-06)", () => {
  it.each([
    "SVC_KICKER",
    "get('service')",
    "fixedRoutes",
    "modeNoteFor",
    "flightRequired",
    "heroCityOn",
    "heroAirportOn",
    "data-hero-mode",
    "mode: 'one-way'",
    "patch.mode",
  ])("has no %s", (needle) => {
    expect(home).not.toContain(needle);
  });

  it("keeps the kicker constant", () => {
    expect(home).toContain("tKicker: t.kicker");
  });
});

describe("home.dc.html bar and sheet on one trip state (26.4-09)", () => {
  it("mounts two bars (in-hero, docked) and one sheet", () => {
    expect(raw.match(/name="BookingBar"/g)).toHaveLength(2);
    expect(raw.match(/name="BookingSheet"/g)).toHaveLength(1);
  });

  it("the box and the sheet share one check and one hand-off", () => {
    expect(home).toContain("checkTrip()");
    expect(home).toContain("goCheckout()");
    expect(home).toContain("shSubmit = () =>");
    expect(home).toMatch(/shSubmit = \(\) => \{\s*const r = this\.checkTrip\(\);\s*if \(r\.ok\) \{ this\.goCheckout\(\)/);
  });

  it("the old bottom-sheet shell is gone", () => {
    for (const needle of ["data-shell", "data-sheetbody", "data-sheetonly", "openSheetPickup", "scrimClick"]) {
      expect(home).not.toContain(needle);
    }
  });

  it("uses one media boundary for bar and box", () => {
    expect(home).toContain("matchMedia('(max-width:1080px)')");
    expect(home).toContain("@media (max-width:1080px){\n[data-bookcard]{display:none!important}");
  });

  it("docks with an IntersectionObserver, resets on bfcache and hands chips to the sheet", () => {
    expect(home).toContain("IntersectionObserver");
    expect(home).toContain("'pageshow'");
    expect(home).toContain("e.persisted");
    expect(home).toContain("d.handled = true");
    expect(home).toContain("[data-bs]");
    // The sheet sets `inert` on the page behind it itself (BookingSheet._lock); the e2e spec asserts it.
    expect(raw).toContain("inert");
  });

  it("never builds a Lenis or smooth scroll", () => {
    expect(home).not.toContain("new Lenis");
    expect(home).not.toMatch(/(?<!over)scroll-behavior/);
  });

  it("stores no trip: only the Mapbox session token and the stale-trip cleanup touch storage", () => {
    const geo = /function geoSession\(\) \{[\s\S]*?\n\}/.exec(home)?.[0] ?? "";
    const clean = /function cleanStaleTrip\(\) \{[\s\S]*?\n\}/.exec(home)?.[0] ?? "";
    expect(geo).toContain("sessionStorage.getItem('vamosGeoSession')");
    expect(geo).toContain("sessionStorage.setItem('vamosGeoSession'");
    expect(clean).toContain("sessionStorage.removeItem");
    const rest = home.replace(geo, "").replace(clean, "");
    expect(rest).not.toMatch(/sessionStorage/);
    expect(home).not.toMatch(/setItem\(\s*['"][^'"]*(trip|draft|booking)/i);
    expect(home).not.toMatch(/localStorage\.setItem\(\s*['"](?!vamosLang|vamosCurrency)/);
  });
});
