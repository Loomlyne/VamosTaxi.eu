// apps/web/lib/ops/ops-dc-chauffeur-class.test.ts
//
// Quick 261001-chauffeur-car — owner decisions 2026-10-01 (.planning/decisions/2026-10-01-no-cars-page.md):
// no cars on the dashboard; each chauffeur has a class and a plate; Assign lists only the drivers of
// the booking's class; each chauffeur keeps a read-only history of his bookings.
//
// Pinned on the live dashboard DC sources (app/ops/*.dc.html, app/vamos-ops-data.js) with the
// technique of ops-dc-dash-design.test.ts: the DC logic class is loaded from the page source and run
// with a stubbed window. No DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

// ── 0 · the console store loads once ────────────────────────────────────────────────────────
describe("0 · the console store", () => {
  it("loads once: a second run of the file keeps the first store and its listeners", async () => {
    // The shell's helmet runs vamos-ops-data.js twice (parser, then the dc-runtime). The second run
    // replaced window.VamosOps, so a screen that had subscribed to the first store never heard the
    // second store's list arrive: the Chauffeurs list could stay at "0" (found on the rejected Cars
    // branch, 6 of 12 offline loads of main's real shell).
    let calls = 0;
    const windowStub: Record<string, unknown> = {
      VamosOpsApi: {
        request: () => {
          calls++;
          return Promise.resolve({ ok: true, data: [{ id: "c0000000-0000-4000-8000-00000000aa01", name: "Marco" }] });
        },
      },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
    };
    const context = vm.createContext({
      window: windowStub,
      CustomEvent: class {},
      setTimeout: () => 0,
      clearTimeout: () => undefined,
      console,
    });
    const source = read("app/vamos-ops-data.js");
    vm.runInContext(source, context);
    const first = windowStub.VamosOps as { chauffeurs: { all: () => unknown[] }; onAny: (fn: () => void) => () => void };
    let heard = 0;
    first.onAny(() => {
      heard++;
    });
    vm.runInContext(source, context);
    expect(windowStub.VamosOps).toBe(first);
    (windowStub.VamosOps as typeof first).chauffeurs.all();
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);
    expect(heard).toBeGreaterThan(0);
  });
});
