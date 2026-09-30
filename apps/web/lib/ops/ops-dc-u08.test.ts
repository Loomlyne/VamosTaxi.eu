// apps/web/lib/ops/ops-dc-u08.test.ts
//
// 26.2-u08 regression tests for the live dashboard DC surfaces (app/ops/*.dc.html).
// Each test pulls one expression out of the DC source and runs it, so the test fails
// on the pre-fix source and passes on the fixed one. No DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readDc(name: string): string {
  return readFileSync(join(repoRoot, "app/ops", name), "utf8");
}

function grab(src: string, re: RegExp, label: string): string {
  const m = src.match(re);
  if (!m?.[1]) throw new Error(`missing ${label}`);
  return m[1];
}

describe("OpsFleet chauffeur delete", () => {
  it("onDelete hands the store promise back to OpsTable (else the dialog reports a failure)", () => {
    const src = readDc("OpsFleet.dc.html");
    const body = grab(src, /\n\s*onDelete: (\(id\) => [^\n]*),\n/, "OpsFleet onDelete");
    const answer = Promise.resolve({ ok: true });
    const onDelete = new Function("store", `return ${body};`)({ remove: () => answer }) as (
      id: string,
    ) => unknown;
    expect(onDelete("c1")).toBe(answer);
  });
});

// VamosLocale.lang is a function (app/vamos-locale.js); reading it as a value stores the
// function itself, which no copy table has a key for, so the surface stays English.
const fakeLocale = { lang: () => "de" };

describe("ops shell language on mount", () => {
  it("ops.dc.html starts in the stored language, not the function object", () => {
    const src = readDc("ops.dc.html");
    const expr = grab(
      src,
      /if \(window\.VamosLocale\) this\.setState\(\{ lang: ([^}]*) \}\);/,
      "ops.dc.html mount lang",
    );
    const lang = new Function("window", `return ${expr};`)({ VamosLocale: fakeLocale });
    expect(lang).toBe("de");
  });
});

describe("AuthForm locale sent to /api/auth", () => {
  it("locale() answers the language code, so JSON.stringify keeps the key", () => {
    const src = readDc("AuthForm.dc.html");
    const body = grab(src, /\n  locale\(\) \{\n([\s\S]*?)\n  \}\n/, "AuthForm locale()");
    const locale = new Function("window", "localStorage", body) as (
      w: unknown,
      ls: unknown,
    ) => unknown;
    const got = locale({ VamosLocale: fakeLocale }, { getItem: () => null });
    expect(got).toBe("de");
    expect(JSON.parse(JSON.stringify({ locale: got }))).toEqual({ locale: "de" });
  });
});

describe("OpsSettings save", () => {
  it("a saved answer lands in the settings store, so the screen stops reading as unsaved", async () => {
    const src = readDc("OpsSettings.dc.html");
    const body = grab(src, /\n  save = \(\) => \{\n([\s\S]*?)\n  \};\n/, "OpsSettings save");
    const stored: Record<string, unknown> = { company: "Old AG" };
    const answer = { ok: true, data: { company: "New AG" } };
    const win = {
      VamosOps: {
        settings: {
          get: () => ({ ...stored }),
          apply: (patch: Record<string, unknown>) => Object.assign(stored, patch),
        },
      },
    };
    const self = {
      state: { draft: { company: "New AG" } },
      setState: () => undefined,
    };
    const run = new Function("api", "window", "setTimeout", "clearTimeout", body);
    run.call(self, () => Promise.resolve(answer), win, () => 0, () => undefined);
    await Promise.resolve();
    await Promise.resolve();
    expect(win.VamosOps.settings.get().company).toBe("New AG");
  });
});
