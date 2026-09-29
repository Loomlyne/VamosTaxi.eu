// apps/web/lib/ops/ops-new-trip-264.test.ts
//
// 26.4-08 (D-08, D-09): source pins for the dashboard New trip flight rule. Airport status comes
// from the picked place (/api/geo/retrieve), never from the flight text; the flight is required
// only for an airport pickup and is otherwise optional and price-neutral.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, "../../../..", "app/ops/OpsNewTrip.dc.html"), "utf8");
const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("New trip flight rule (D-09)", () => {
  it("looks the airport up from the picked place", () => {
    expect(source).toContain("/api/geo/retrieve");
    expect(source).toContain("pickupAir: !!(pl && pl.isAirport === true)");
  });
  it("labels the field and words the hint and errors", () => {
    expect(source).toContain("tFlight: 'Flight number'");
    expect(source).toContain("Optional. It does not change the price.");
    expect(source).toContain("Enter the flight number");
    expect(source).toContain("Check the flight number");
  });
  it("requires the flight only when the pickup is an airport", () => {
    expect(source).toMatch(/if \(st\.pickupAir && !flight\)[^;]*Enter the flight number/);
  });
  it("never derives airport status from the flight text", () => {
    expect(source).not.toMatch(/pickupAir:[^,}]*flight/i);
  });
  it("uses no warning or tinted yellow", () => {
    expect(source).not.toMatch(/vt-warning|vt-yellow-(50|100|200|300|600|700)/);
  });
});
