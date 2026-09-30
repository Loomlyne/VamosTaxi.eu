import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Quick 260930-bp2 item 1: the signed class-card picture reads "Plätze" / "Koffer" in German.
// Only the class-card keys change; "bagsCount" (trip strip, summary) keeps "Gepäckstücke".
const msg = (l: string) =>
  JSON.parse(readFileSync(join(__dirname, `../../i18n/messages/${l}.json`), "utf8")).checkout as Record<string, string>;

describe("checkout class-card bag words", () => {
  it("German class cards say Koffer, not Gepäckstücke", () => {
    const de = msg("de");
    expect(de.classSeats).toContain("Plätze");
    expect(de.classBags).toBe("{n} Koffer");
    expect(de.takesUpToBags).toBe("Nimmt bis zu {n} Koffer auf");
    expect(de.classBags + de.takesUpToBags).not.toMatch(/Gepäck/);
  });
  it("Arabic class cards keep the signed words", () => {
    const ar = msg("ar");
    expect(ar.classSeats).toBe("{n} مقاعد");
    expect(ar.classBags).toBe("{n} حقائب");
  });
  it("the trip strip keeps its own key", () => {
    expect(msg("de").bagsCount).toContain("Gepäckstück");
  });
});
