// apps/web/lib/i18n-opt-out.test.ts
//
// 26.2 row "data-i18n-skip leftovers". app/vamos-locale.js honours `data-vt-no-i18n` and
// `translate="no"` only; `data-i18n-skip` is ignored, so a subtree marked with it is translated
// anyway. No customer surface and no React page may carry the ignored attribute.
// (design-system/_ds_bundle.js is vendored and keeps its own list; it is not swept.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const ROOTS = ["app", "apps/web/app", "apps/web/components"];
const EXT = /\.(dc\.html|html|js|tsx|ts)$/;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("i18n opt-out attribute", () => {
  it("no surface uses the ignored data-i18n-skip", () => {
    const offenders = ROOTS.flatMap((r) => walk(join(repo, r), []))
      .filter((f) => readFileSync(f, "utf8").includes("data-i18n-skip"))
      .map((f) => relative(repo, f));
    expect(offenders).toEqual([]);
  });
});
