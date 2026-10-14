import { describe, expect, it } from "vitest";
import { TRANSLATE_MODEL } from "../translate/model";
import { gemmaReply, stubAi } from "../translate/ai-stub";
import { planExtraLabels, type ExtraLabelRow } from "./extra-label-translate";

// The stub answers "<English>-<lang>" for every requested target (one Gemma call carries them all); Arabic
// gets Arabic letters because the engine guard rejects an Arabic answer in Latin script.
const ai = stubAi((_m, input) => {
  const messages = input.messages as { content: string }[];
  const { targets, text } = JSON.parse(messages[1]!.content) as { targets: string[]; text: string };
  return gemmaReply(Object.fromEntries(targets.map((l) => [l, l === "ar" ? `${text} صندوق` : `${text}-${l}`])));
});

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
    expect(r).toMatchObject({ en: "Roof box", de: "Roof box-de", fr: "Roof box-fr", ar: "Roof box صندوق" });
    expect(r.machineLangs).toEqual(["de", "fr", "ar"]);
    expect(ai.calls.at(-1)!.model).toBe(TRANSLATE_MODEL);
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
    expect(r.fr).toBe("Ski box-fr");
    expect(r.ar).toBe("Ski box صندوق");
    expect(r.machineLangs).toEqual(["fr", "ar"]);
  });
  it("no AI: saves with empty languages", async () => {
    const r = await planExtraLabels(undefined, null, { en: "Roof box" });
    expect(r).toEqual({ en: "Roof box", de: null, fr: null, ar: null, machineLangs: [] });
  });
});
