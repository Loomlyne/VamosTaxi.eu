import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { E2E_SPECS } from "../e2e-specs";

// 26.0 D-01: the list the macOS job ignores and the Linux job runs. Every entry must name exactly one spec.
const TESTS = join(__dirname, "..");

function allSpecs(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) allSpecs(full, out);
    else if (e.endsWith(".spec.ts")) out.push(e);
  }
  return out;
}

describe("E2E_SPECS", () => {
  const files = allSpecs(TESTS);

  it("has no duplicate entries", () => {
    expect(new Set(E2E_SPECS).size).toBe(E2E_SPECS.length);
  });

  it("names exactly one existing spec per entry", () => {
    for (const pattern of E2E_SPECS) {
      const name = pattern.replace(/^\*\*\//, "");
      expect(files.filter((f) => f === name), pattern).toHaveLength(1);
    }
  });
});
