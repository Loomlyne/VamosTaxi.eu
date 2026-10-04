import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");

/** Every `.dc.html` under app/. */
function dcFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? dcFiles(join(dir, e.name)) : e.name.endsWith(".dc.html") ? [join(dir, e.name)] : [],
  );
}

describe("every icon a page names is vendored", () => {
  // The design system's Icon loads assets/icons/<name>.svg as a CSS mask. A name with no file is a 404
  // and a blank spot on the page (the dashboard's distance chip named "route" with no file until 2026-10-04).
  // Names set by a binding (name="{{ ... }}") are skipped: only a literal name can be checked here.
  it("each literal Icon name in app/**/*.dc.html has a file in assets/icons", () => {
    const missing: string[] = [];
    for (const file of dcFiles(join(ROOT, "app"))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/Icon"?[^>]*?\bname="([a-z0-9-]+)"/g)) {
        if (!existsSync(join(ROOT, "assets/icons", `${m[1]}.svg`))) missing.push(`${relative(ROOT, file)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("route.svg is the Lucide route icon (24x24, stroke, no fill)", () => {
    const svg = readFileSync(join(ROOT, "assets/icons/route.svg"), "utf8");
    expect(svg).toMatch(/viewBox="0 0 24 24"/);
    expect(svg).toMatch(/stroke="currentColor"/);
    expect(svg).toMatch(/fill="none"/);
    expect(svg).toContain('d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"');
  });
});
