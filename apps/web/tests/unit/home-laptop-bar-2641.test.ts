// apps/web/tests/unit/home-laptop-bar-2641.test.ts
//
// Phase 26.4.1 (D-01..D-04): text pins for the laptop booking bar in home.dc.html.
// >=1081 two rows, >=1272 one row; <=1080 stays the 26.4 bar + sheet.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raw = readFileSync(join(process.cwd(), "../../app/home/home.dc.html"), "utf8");
const MARK = "/* 26.4.1 laptop bar";
const start = raw.indexOf(MARK);
const end = raw.indexOf("</style>", start);
const block = start >= 0 ? raw.slice(start, end) : "";

describe("home.dc.html laptop bar (26.4.1-01)", () => {
  it("has the 26.4.1 block", () => {
    expect(start).toBeGreaterThan(0);
    expect(block.length).toBeGreaterThan(400);
  });

  it("card spans the hero at >=1081", () => {
    const m = block.match(/@media \(min-width:1081px\)\s*\{[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/\[data-bookcard\]\{[^}]*max-width:none/);
    expect(m![0]).toMatch(/\[data-bookcard\]\{[^}]*padding:var\(--vt-space-4\)/);
  });

  it("one row at >=1272", () => {
    expect(block).toContain("@media (min-width:1272px)");
    expect(block).toContain('"from flight swap to when trav cta"');
    expect(block).toContain('"from swap to when trav cta"');
  });

  it("two rows at 1081-1271", () => {
    expect(block).toContain("@media (min-width:1081px) and (max-width:1271px)");
    expect(block).toContain('"from flight swap to"');
    expect(block).toContain('"from swap to"');
    expect(block).toMatch(/grid-area:tc/);
  });

  it("compact travellers trigger", () => {
    expect(raw.split('aria-label="{{ travSummary }}"').length - 1).toBe(1);
    expect(raw).toContain('title="{{ travSummary }}"');
    expect(raw).toMatch(/data-trav-fig="1"[^>]*>\{\{ paxN \}\}/);
    expect(raw).toMatch(/data-trav-fig="1"[^>]*>\{\{ bagsN \}\}/);
    expect(raw).toMatch(/name="luggage"/);
  });

  it("lists the 1272 listener", () => {
    expect(raw).toContain("'(min-width:1272px)'");
  });

  it("block obeys the laws", () => {
    expect(block).not.toMatch(/(^|[^-a-z])(left|right)\s*:/);
    expect(block).not.toContain("--vt-shadow-accent");
    expect(block).not.toMatch(/--vt-yellow-(50|100|200|300|600|700)/);
    expect(block).not.toContain("scroll-behavior");
    expect(block).not.toContain("CHF");
    expect(raw).not.toContain('role="tablist"');
  });

  it("keeps the 26.4 pins", () => {
    expect(raw).toContain("matchMedia('(max-width:1080px)')");
    expect(raw).toContain("@media (max-width:1080px){\n[data-bookcard]{display:none!important}");
  });
});
