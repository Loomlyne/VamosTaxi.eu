import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseRateVersionLabel, draftLabelFrom } from "./rate-version-label";

// Live labels read 2026-10-05: rate_versions 19 carries "draft" twelve times, settings_versions 15 eleven times.
const BASE = "Staging matrix — placeholder, not owner-approved";
const ELEVEN = `${BASE}${" draft".repeat(11)}`;

describe("rate version labels (M18)", () => {
  it("a draft carries exactly one ' draft', however many the source had", () => {
    expect(draftLabelFrom(BASE)).toBe(`${BASE} draft`);
    expect(draftLabelFrom(`${BASE} draft`)).toBe(`${BASE} draft`);
    expect(draftLabelFrom(ELEVEN)).toBe(`${BASE} draft`);
    expect(draftLabelFrom(`${BASE} Draft  DRAFT `)).toBe(`${BASE} draft`);
  });

  it("cloning a clone of a clone never grows the label", () => {
    let label = BASE;
    for (let i = 0; i < 12; i += 1) label = draftLabelFrom(label);
    expect(label).toBe(`${BASE} draft`);
  });

  it("the published label has no trailing draft", () => {
    expect(baseRateVersionLabel(ELEVEN)).toBe(BASE);
    expect(baseRateVersionLabel(`${BASE} draft`)).toBe(BASE);
    expect(baseRateVersionLabel(BASE)).toBe(BASE);
  });

  it("'draft' inside a label is kept; only the trailing ones go", () => {
    expect(baseRateVersionLabel("Owner draft sheet — four class floors")).toBe("Owner draft sheet — four class floors");
    expect(baseRateVersionLabel("Redraft")).toBe("Redraft");
    expect(draftLabelFrom("draft")).toBe("draft");
    expect(draftLabelFrom("")).toBe("draft");
  });

  it("the clone and the Publish route use these helpers, not a hand-built ' draft'", () => {
    const web = join(__dirname, "..", "..");
    const rateBook = readFileSync(join(web, "lib/ops/rate-book.ts"), "utf8");
    const publish = readFileSync(join(web, "app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts"), "utf8");
    expect(rateBook).toMatch(/draftLabelFrom\(source\.label\)/);
    expect(rateBook).not.toMatch(/\$\{source\.label\} draft/);
    expect(publish).toMatch(/baseRateVersionLabel\(row\.label\)/);
    expect(publish).not.toMatch(/nullif\(\$\{row\.label\}/);
  });
});
