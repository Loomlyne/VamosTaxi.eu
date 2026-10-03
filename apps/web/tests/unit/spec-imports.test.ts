import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 26.0 D-06: every Playwright spec goes through tests/support/test.ts so
// prefers-reduced-transparency stays pinned. See that file's header.
const ROOT = join(__dirname, "..");

function specs(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => join(dir, f));
}

describe("spec imports", () => {
  const files = [...specs("visual"), ...specs("integration")];

  it("scans a non-empty set of specs", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no spec imports from @playwright/test or calls a bare .emulateMedia(", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      if (src.includes('from "@playwright/test"')) bad.push(`${f}: imports @playwright/test`);
      if (/\.emulateMedia\(/.test(src)) bad.push(`${f}: bare .emulateMedia(`);
    }
    expect(bad).toEqual([]);
  });
});
