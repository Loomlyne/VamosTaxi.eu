// apps/web/lib/ops/ops-button-variants-dc.test.ts
//
// U11 (audit .planning/audits/2026-10-05-repo-investigation.md; owner signed "all 26 white with a line",
// 2026-10-05). The design-system Button has five variants: primary, secondary, ghost, light, danger.
// It has no `outline`. A `<Button variant="outline">` gets the class `vt-btn--outline`, which has no
// rule, so the browser drew its own grey button face (no hairline, no hover, no press). The quiet button
// the dashboard meant is `ghost`. IconButton and Badge do have an `outline` and are not touched.
// Pure source reads: no DOM, no network.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const opsDir = join(repoRoot, "app/ops");
const screens = readdirSync(opsDir)
  .filter((name) => name.endsWith(".dc.html"))
  .sort()
  .map((name) => ({ name, source: readFileSync(join(opsDir, name), "utf8") }));

const KIT_BUTTON_VARIANTS = ["primary", "secondary", "ghost", "light", "danger"];

/** Every `<x-import ...>` tag of a screen (attribute values may hold `>`, so quotes are skipped over). */
function importTags(source: string): string[] {
  return source.match(/<x-import(?:"[^"]*"|'[^']*'|[^>"'])*>/g) ?? [];
}

/** The Button tags only: `...Button"` exactly, never `IconButton"`. */
function buttonTags(source: string): string[] {
  return importTags(source).filter((tag) => /VamosTaxiDesignSystem_245af1\.Button"/.test(tag));
}

describe("U11: no Button on the dashboard asks for a variant the kit does not have", () => {
  it("finds the screens and their buttons (the other tests are not reading nothing)", () => {
    expect(screens.length).toBeGreaterThan(10);
    const buttons = screens.reduce((n, s) => n + buttonTags(s.source).length, 0);
    expect(buttons).toBeGreaterThan(60);
  });

  it('no <Button> in app/ops says variant="outline" (IconButton excepted)', () => {
    const offenders = screens.flatMap((s) =>
      buttonTags(s.source)
        .filter((tag) => /\bvariant="outline"/.test(tag))
        .map((tag) => `${s.name}: ${tag.slice(0, 140)}`),
    );
    expect(offenders).toEqual([]);
  });

  it("a Button whose variant is written out is one of the kit's five", () => {
    const offenders = screens.flatMap((s) =>
      buttonTags(s.source).flatMap((tag) => {
        const literal = /\bvariant="([^"{]*)"/.exec(tag);
        if (!literal || KIT_BUTTON_VARIANTS.includes(literal[1] ?? "")) return [];
        return [`${s.name}: variant="${literal[1]}"`];
      }),
    );
    expect(offenders).toEqual([]);
  });

  // A bound variant (`variant="{{ name }}"`) is decided in the screen's code. The values it can take are read from
  // the lines that assign it, in the two shapes the screens use: `name: cond ? 'a' : 'b'` and `name: 'a'`.
  // Anything else fails loudly, so a new shape has to be looked at by a person. An empty string is not a
  // variant either: the Button would class itself `vt-btn--` and draw the browser's grey face.
  it("a Button whose variant is bound ({{ name }}) can only be one of the kit's five, never '' or 'outline'", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const s of screens) {
      for (const tag of buttonTags(s.source)) {
        const bound = /\bvariant="\{\{\s*([\w.]+)\s*\}\}"/.exec(tag);
        if (!bound) continue;
        const name = (bound[1] ?? "").split(".").pop() ?? "";
        const assignments = s.source
          .split("\n")
          .filter((line) => new RegExp(`\\b${name}\\s*:`).test(line) && !line.includes("<x-import"));
        if (assignments.length === 0) offenders.push(`${s.name}: nothing assigns ${name}`);
        for (const line of assignments) {
          const ternary = /\?\s*'([^']*)'\s*:\s*'([^']*)'/.exec(line);
          const plain = new RegExp(`\\b${name}\\s*:\\s*'([^']*)'`).exec(line);
          const values = ternary ? [ternary[1], ternary[2]] : plain ? [plain[1]] : [];
          if (values.length === 0) offenders.push(`${s.name}: cannot read the values of ${name}: ${line.trim().slice(0, 120)}`);
          for (const value of values) {
            checked += 1;
            if (!KIT_BUTTON_VARIANTS.includes(value ?? "")) offenders.push(`${s.name}: ${name} can be '${value}'`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(8); // kanbanVariant, tableVariant, btnVariant, vatSaveVariant: two values each
  });

  it("the Kanban / Table switch of the calendar board: the open view is secondary (charcoal), the other is ghost", () => {
    const board = screens.find((s) => s.name === "OpsCalendarBoard.dc.html")?.source ?? "";
    expect(board).toContain("kanbanVariant: view === 'kanban' ? 'secondary' : 'ghost'");
    expect(board).toContain("tableVariant: view === 'table' ? 'secondary' : 'ghost'");
  });
});

describe("U11: what the kit really has (the guard's premise)", () => {
  const kit = readFileSync(join(repoRoot, "design-system/_ds_bundle.js"), "utf8");

  it("Button has a rule for each of its five variants and none for outline", () => {
    for (const variant of KIT_BUTTON_VARIANTS) expect(kit).toContain(`.vt-btn--${variant}{`);
    expect(kit).not.toContain(".vt-btn--outline");
  });

  it("IconButton and Badge do have an outline, so those uses stay", () => {
    expect(kit).toContain(".vt-iconbtn--outline{");
    expect(kit).toContain(".vt-badge--outline");
    const iconOutline = screens.flatMap((s) =>
      importTags(s.source).filter((tag) => /IconButton"/.test(tag) && /variant="outline"/.test(tag)),
    );
    expect(iconOutline.length).toBeGreaterThan(0);
  });
});
