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
