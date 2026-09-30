// Owner decision 14 (2026-09-30): one "Last updated" constant for privacy, terms, cancellation and
// imprint, in app/vamos-legal-updated.js. The control session sets it on the ship day.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("legal pages Last updated", () => {
  it("has exactly one ISO date constant", () => {
    const matches = [...read("app/vamos-legal-updated.js").matchAll(/var LEGAL_UPDATED = '(\d{4}-\d{2}-\d{2})';/g)];
    expect(matches).toHaveLength(1);
    expect(Number.isNaN(Date.parse(`${matches[0]?.[1]}T00:00:00Z`))).toBe(false);
  });

  for (const page of ["privacy", "terms", "cancellation", "imprint"]) {
    it(`${page}: mock and Next.js page read the constant, no hard-coded date`, () => {
      const mock = read(`app/pages/${page}.dc.html`);
      expect(mock).toContain('<script src="../vamos-legal-updated.js"></script>');
      expect(mock).toContain("{{ updatedLabel }}");
      expect(mock).not.toMatch(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/);
      expect(read(`apps/web/app/[locale]/${page}/page.tsx`)).toMatch(/\n\s+shipDated\n/);
    });
  }

  it("next.config reads the same file", () => {
    expect(read("apps/web/next.config.ts")).toContain("../../app/vamos-legal-updated.js");
  });
});
