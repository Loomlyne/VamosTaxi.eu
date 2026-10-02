// apps/web/lib/audit-26-2-u08.test.ts
//
// 26.2 audit unit 08 (live Design Component surfaces). The Design Component scripts run in
// bare vm contexts with stubs: no DOM, no network.
//   U08-1  a date filled from a flight reads its own month and weekday, not "Aug".
//   U08-2  a failed bookings poll keeps the last good rows on the board.
//   U08-3  a failed first reviews load is asked again later, not latched as "loaded".

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const app = (rel: string) => readFileSync(join(here, "../../../app", rel), "utf8");

describe("U08-1: home date from a flight", () => {
  const home = app("home/home.dc.html");
  const start = home.indexOf("const WHEN_TAG");
  const end = home.indexOf("class Component extends DCLogic");
  const ctx = vm.createContext({});
  vm.runInContext(`${home.slice(start, end)}\nthis.whenText = whenText;`, ctx);
  const whenText = (ctx as { whenText: (y: number, m: number, d: number, t: string, l: string) => string }).whenText;

  it("14 Oct 2026 is a Wednesday in October, in English", () => {
    const out = whenText(2026, 9, 14, "", "en");
    expect(out).toMatch(/Wed/);
    expect(out).toMatch(/14/);
    expect(out).toMatch(/Oct/);
    expect(out).not.toMatch(/Aug/);
  });

  it("the old August-only helper is gone and renderVals uses whenText", () => {
    expect(home).not.toContain("fmtDate");
    expect(home).not.toContain("dowRef");
    expect(home).toContain("s.day ? whenText(s.dayY, s.dayM, s.day, '', s.lang)");
  });
});

describe("U08-2: failed bookings poll", () => {
  it("keeps the rows of the last good load", async () => {
    let calls = 0;
    const handlers: Record<string, () => void> = {};
    const windowStub: Record<string, unknown> = {
      VamosOpsApi: {
        request: () => {
          calls += 1;
          return Promise.resolve(
            calls === 1
              ? { ok: true, data: [{ id: "VT-1", status: "pending", paid: true }] }
              : { ok: false, code: "network" },
          );
        },
      },
      dispatchEvent: () => true,
      addEventListener: (name: string, fn: () => void) => {
        handlers[name] = fn;
      },
    };
    const context = vm.createContext({
      window: windowStub,
      document: { visibilityState: "visible", addEventListener: () => undefined },
      CustomEvent: class {},
      setTimeout: () => 0,
      clearTimeout: () => undefined,
      console,
    });
    vm.runInContext(app("vamos-ops-data.js"), context);
    const ops = windowStub.VamosOps as { bookings: { all: () => Array<{ id: string }> } };
    ops.bookings.all();
    await new Promise((resolve) => setImmediate(resolve));
    expect(ops.bookings.all().map((b) => b.id)).toEqual(["VT-1"]);

    handlers["focus"]?.(); // the same path a poll tick takes: loaded=false, hydrate again
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(ops.bookings.all().map((b) => b.id)).toEqual(["VT-1"]);
  });
});

describe("U08-3: failed first reviews load", () => {
  it("is not latched as loaded, and asks again after the back-off", async () => {
    let calls = 0;
    let clock = 1_000_000;
    const windowStub: Record<string, unknown> = {
      VamosOpsApi: {
        request: () => {
          calls += 1;
          return Promise.resolve(
            calls === 1
              ? { ok: false, code: "network" }
              : { ok: true, data: [{ id: "r1", authorName: "A", body: "Fine", rating: 5, published: true, source: "manual" }] },
          );
        },
      },
      dispatchEvent: () => true,
    };
    const context = vm.createContext({
      window: windowStub,
      location: { hostname: "vamostaxi.site" },
      CustomEvent: class {},
      Date: { now: () => clock },
      console,
    });
    vm.runInContext(app("vamos-reviews.js"), context);
    const reviews = windowStub.VamosReviews as { all: () => unknown[]; ready: () => boolean };

    reviews.all();
    await new Promise((resolve) => setImmediate(resolve));
    expect(reviews.ready()).toBe(false);
    expect(calls).toBe(1);

    reviews.all(); // inside the back-off: no second request
    expect(calls).toBe(1);

    clock += 6000;
    reviews.all();
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toBe(2);
    expect(reviews.ready()).toBe(true);
    expect(reviews.all()).toHaveLength(1);
  });
});
