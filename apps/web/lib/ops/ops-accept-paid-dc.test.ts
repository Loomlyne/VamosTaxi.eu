// apps/web/lib/ops/ops-accept-paid-dc.test.ts
//
// 261002, review of item 4, round 3: Accept again on a change request whose payment page is already paid
// answers "already-paid" (nothing is replaced; the payment applies the change when the settle records it).
// The route answers 409, and the dashboard booking page (app/ops/OpsDetail.dc.html) says so in its four
// languages instead of "Could not apply edit". No DOM: reads the DC source, like the other OpsDetail pins.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { failStatus } from "./edit-request-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const dc = readFileSync(join(repoRoot, "app/ops/OpsDetail.dc.html"), "utf8");

describe("Accept on a request whose difference is already paid", () => {
  it("the route answers 409 (a conflict the owner waits out, not a bad request)", () => {
    expect(failStatus("already-paid")).toBe(409);
  });

  it("the Accept handler shows its own notice for already-paid and reloads the booking", () => {
    const a = dc.indexOf("acceptPending: () => {");
    const b = dc.indexOf("refusePending: () => {", a);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    const handler = dc.slice(a, b);
    expect(handler).toMatch(/code === 'already-paid'\) \{ if \(ops\) ops\.bookings\.reset\(\); this\.notify\(t\.acceptPaid\); \}/);
    // It comes before the generic failure.
    expect(handler.indexOf("t.acceptPaid")).toBeLessThan(handler.indexOf("t.editFailed"));
  });

  it("the notice exists in English, German, French and Arabic, in plain words", () => {
    const lines = dc.split("\n").filter((l) => /^\s*acceptPaid:'/.test(l));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("The customer has already paid the difference. The change is applied when the payment is recorded.");
    expect(lines[1]).toContain("Der Kunde hat die Differenz bereits bezahlt.");
    expect(lines[1]).not.toContain("ß");
    expect(lines[2]).toContain("Le client a déjà payé la différence.");
    expect(lines[3]).toContain("دفع العميل الفرق بالفعل.");
  });
});
