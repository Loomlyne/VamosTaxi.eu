// apps/web/tests/unit/home-flight-fixtures.test.ts
//
// Home flight field must not ship a local sample schedule.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(join(process.cwd(), "../../app/home/home.dc.html"), "utf8");

describe("home.dc.html flight field", () => {
  it("does not contain const FLIGHTS", () => {
    expect(home).not.toMatch(/const FLIGHTS/);
  });

  it("does not contain LX318, LX39, or sampleFeed", () => {
    expect(home).not.toMatch(/LX318/);
    expect(home).not.toMatch(/LX39/);
    expect(home).not.toMatch(/sampleFeed/);
  });

  it("has no flight feed: no live-update switches, no autofill (the provider itself: lib/flight/no-provider.test.ts)", () => {
    expect(home).not.toMatch(/simulateLiveUpdates|flightTrackingEnabled|flightRefreshMs/);
    expect(home).not.toMatch(/searchFlights|refreshFlight|applyFlight|flightData/);
  });

  it("keeps the plain flight number field", () => {
    expect(home).toContain("FLIGHT_RE");
    expect(home).toContain('data-bx="flight"');
    expect(home).toContain("setFno");
  });
});
