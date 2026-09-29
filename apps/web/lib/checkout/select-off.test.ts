import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("home Select off", () => {
  const board = source("components/home/BookingBoard.tsx");

  it("imports classIsSelectable from the charge gate", () => {
    expect(board).toMatch(
      /import\s*\{[^}]*\bclassIsSelectable\b[^}]*\}\s*from\s*["']@\/lib\/checkout\/charge-gate["']/,
    );
    expect(board).toMatch(/classIsSelectable\(/);
  });

  it("does not label the card or price stack with pricing_not_live", () => {
    expect(board).not.toContain("REFUSAL_BINDINGS.pricing_not_live");
    expect(board).not.toContain("pricingNotLive");
  });

  it("publicFleet still only drops no_rate", () => {
    const start = board.indexOf("function publicFleet");
    const end = board.indexOf("function ineligiblePrice");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fleet = board.slice(start, end);
    expect(fleet).toContain('entry.ineligible_reason !== "no_rate"');
    expect(fleet).not.toContain("total_rappen");
    expect(fleet).not.toContain("classIsSelectable");
  });
});
