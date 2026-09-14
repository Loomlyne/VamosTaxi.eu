// apps/web/lib/pricing/booking-board-null.test.ts
//
// 11-06: public board amounts CHF 000 until Publish-as-flip (D-19).
// Source-read BookingBoard.tsx. currency / public-chf tests are not proof.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("BookingBoard nulls amounts when !pricing_live (D-19)", () => {
  const board = source("components/home/BookingBoard.tsx");

  it("reads quote.pricing_live", () => {
    expect(board).toMatch(/quote\.pricing_live/);
  });

  it("class cards pass null into formatChfRappen on the !pricing_live path", () => {
    expect(board).toMatch(/formatChfRappen\(/);
    expect(board).not.toMatch(/formatChfRappen\(\s*entry\.total_rappen/);
    expect(board).toMatch(/pricing_live/);
  });

  it("PriceSummary passes null into chfRappenToDisplay instead of selectedEntry.total_rappen when !pricing_live", () => {
    expect(board).toMatch(/chfRappenToDisplay\(/);
    expect(board).not.toMatch(/chfRappenToDisplay\(\s*selectedEntry\.total_rappen/);
    expect(board).toMatch(/<PriceSummary[\s\S]*chfRappenToDisplay/);
  });

  it("does not hardcode class-floor CHF figures", () => {
    expect(board).not.toMatch(/\b(?:80|100|130|150)\b/);
  });

  it("drops a class the fare book no longer offers", () => {
    expect(board).toMatch(/publicFleet/);
    expect(board).toMatch(/ineligible_reason !== "no_rate"/);
  });
});
