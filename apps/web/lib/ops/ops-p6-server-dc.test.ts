// apps/web/lib/ops/ops-p6-server-dc.test.ts
//
// 26.2 P6 server step: the two places the dashboard Edit had to follow the server
// (app/ops/OpsDetail.dc.html), with no new text — only strings the page already has in four
// languages:
//   - the refusals the change route can still answer show the page's own sentence instead of the
//     generic "Could not change the trip of …" (Keep refused for a car from before 2026-10-01; a new airport
//     pickup without a flight; a time that has passed);
//   - "<driver> stays on the trip and gets the new details by e-mail" shows only when the server
//     sends him one: new places ("trip assigned" again) or a new time (time-change e-mail), D16. A
//     change of passengers or bags alone sends him nothing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dc = readFileSync(join(here, "../../../../app/ops/OpsDetail.dc.html"), "utf8");

describe("OpsDetail follows the change route's answers (26.2 P6)", () => {
  it("named refusals map to sentences the page already has", () => {
    expect(dc).toMatch(/'must-fix': t\.mustFix, 'driver-overlap': t\.mustFix, 'flight-needed': t\.flightNeeded, 'past-time': t\.errPastTime,/);
    for (const key of ["mustFix", "flightNeeded", "errPastTime"]) {
      expect(dc.match(new RegExp(`\\b${key}:'`, "g"))?.length, key).toBe(4);
    }
  });

  it("the kept driver's note shows only for new places or a new time (D16)", () => {
    expect(dc).toMatch(/driverNoteShown: tripReady && hasDriver && !classChanged && !clash && \(placesChanged \|\| tf\.whenChanged\),/);
    expect(dc).toMatch(/confirmDriverShown: hasDriver && !classChanged && \(placesChanged \|\| tf\.whenChanged\) && \(!clash \|\| clashChoice === 'keep'\),/);
  });

  it("after confirm the page names the e-mail the server reports (driverUpdated / driverTakenOff)", () => {
    expect(dc).toMatch(/if \(d\.driverTakenOff\) msg \+= ' ' \+ t\.classDoneDriver;/);
    expect(dc).toMatch(/else if \(d\.driverUpdated && driverName\) msg \+= ' ' \+ fillName\(t\.tripDoneDriverKept\);/);
  });
});
