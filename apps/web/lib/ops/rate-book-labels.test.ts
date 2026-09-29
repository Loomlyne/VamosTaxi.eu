import { describe, expect, it } from "vitest";
import { planExtraLabels, type ExtraLabelRow } from "./extra-label-translate";

const ai = {
  run: async (_m: string, input: Record<string, unknown>) => ({
    translated_text: `${String(input.text)}-${String(input.target_lang)}`,
  }),
};

const stored: ExtraLabelRow = {
  en: "Roof box",
  de: "Dachbox (Chef)",
  fr: "Coffre",
  ar: "صندوق",
  machineLangs: ["fr", "ar"],
};

describe("planExtraLabels", () => {
  it("new extra: en plus machine de/fr/ar", async () => {
    const r = await planExtraLabels(ai, null, { en: "Roof box" });
    expect(r).toMatchObject({ en: "Roof box", de: "Roof box-german", fr: "Roof box-french", ar: "Roof box-arabic" });
    expect(r.machineLangs).toEqual(["de", "fr", "ar"]);
  });
  it("staff-provided fr is kept and not machine", async () => {
    const r = await planExtraLabels(ai, null, { en: "Roof box", labels: { fr: "Malle de toit" } });
    expect(r.fr).toBe("Malle de toit");
    expect(r.machineLangs).toEqual(["de", "ar"]);
  });
  it("unchanged en leaves an edited de untouched", async () => {
    const r = await planExtraLabels(ai, stored, { en: "Roof box", labels: { de: "Dachbox (Chef)", fr: "Coffre", ar: "صندوق" } });
    expect(r).toMatchObject({ de: "Dachbox (Chef)", fr: "Coffre", ar: "صندوق" });
    expect(r.machineLangs).toEqual(["fr", "ar"]);
  });
  it("renamed en re-translates machine languages, keeps staff-edited", async () => {
    const r = await planExtraLabels(ai, stored, { en: "Ski box", labels: { de: "Dachbox (Chef)", fr: "Coffre", ar: "صندوق" } });
    expect(r.de).toBe("Dachbox (Chef)");
    expect(r.fr).toBe("Ski box-french");
    expect(r.ar).toBe("Ski box-arabic");
    expect(r.machineLangs).toEqual(["fr", "ar"]);
  });
  it("no AI: saves with empty languages", async () => {
    const r = await planExtraLabels(undefined, null, { en: "Roof box" });
    expect(r).toEqual({ en: "Roof box", de: null, fr: null, ar: null, machineLangs: [] });
  });
});
