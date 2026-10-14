import { afterEach, describe, expect, it, vi } from "vitest";
import { TRANSLATE_MODEL } from "../translate/model";
import { gemmaReply, stubAi } from "../translate/ai-stub";
import { MAX_LABEL, planExtraLabels, type ExtraLabelRow } from "./extra-label-translate";

afterEach(() => vi.restoreAllMocks());

const targetsOf = (input: Record<string, unknown>): string[] => {
  const messages = input.messages as { role: string; content: string }[];
  return (JSON.parse(messages[1]!.content) as { targets: string[] }).targets;
};

describe("planExtraLabels on the shared engine", () => {
  it("new extra: one model call asks de, fr, ar; all machine", async () => {
    const ai = stubAi(() => gemmaReply({ de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" }));
    const r = await planExtraLabels(ai, null, { en: "Child seat" });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.model).toBe(TRANSLATE_MODEL);
    expect(targetsOf(ai.calls[0]!.input)).toEqual(["de", "fr", "ar"]);
    expect(r).toEqual({ en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال", machineLangs: ["de", "fr", "ar"] });
  });

  it("his typed de is kept, not machine; the model is asked only for fr and ar", async () => {
    const ai = stubAi(() => gemmaReply({ fr: "Siège enfant", ar: "مقعد أطفال" }));
    const r = await planExtraLabels(ai, null, { en: "Child seat", labels: { de: "Kindersitz" } });
    expect(targetsOf(ai.calls[0]!.input)).toEqual(["fr", "ar"]);
    expect(r.de).toBe("Kindersitz");
    expect(r.machineLangs).toEqual(["fr", "ar"]);
  });

  it("renamed English re-translates machine languages and keeps his typed ones", async () => {
    const stored: ExtraLabelRow = { en: "Roof box", de: "Dachbox (Chef)", fr: "Coffre", ar: "صندوق", machineLangs: ["fr", "ar"] };
    const ai = stubAi(() => gemmaReply({ fr: "Coffre de ski", ar: "صندوق تزلج" }));
    const r = await planExtraLabels(ai, stored, {
      en: "Ski box",
      labels: { de: "Dachbox (Chef)", fr: "Coffre", ar: "صندوق" },
    });
    expect(targetsOf(ai.calls[0]!.input)).toEqual(["fr", "ar"]);
    expect(r).toEqual({ en: "Ski box", de: "Dachbox (Chef)", fr: "Coffre de ski", ar: "صندوق تزلج", machineLangs: ["fr", "ar"] });
  });

  it("unchanged English with everything stored makes no model call", async () => {
    const stored: ExtraLabelRow = { en: "Roof box", de: "Dachbox", fr: "Coffre", ar: "صندوق", machineLangs: ["fr", "ar"] };
    const ai = stubAi(() => gemmaReply({}));
    const r = await planExtraLabels(ai, stored, { en: "Roof box", labels: { de: "Dachbox", fr: "Coffre", ar: "صندوق" } });
    expect(ai.calls).toHaveLength(0);
    expect(r.machineLangs).toEqual(["fr", "ar"]);
  });

  it("model down (no binding, throw, timeout): save plan succeeds with empty languages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const empty = { en: "Roof box", de: null, fr: null, ar: null, machineLangs: [] };
    expect(await planExtraLabels(undefined, null, { en: "Roof box" })).toEqual(empty);
    expect(await planExtraLabels(null, null, { en: "Roof box" })).toEqual(empty);
    const boom = stubAi(() => {
      throw new Error("down");
    });
    expect(await planExtraLabels(boom, null, { en: "Roof box" })).toEqual(empty);
    const slow = stubAi(() => {
      const e = new Error("t");
      e.name = "TimeoutError";
      throw e;
    });
    expect(await planExtraLabels(slow, null, { en: "Roof box" })).toEqual(empty);
  });

  it("a language the guard rejects stays null; the others are filled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ de: "Dachbox", fr: "Sure, here is the translation", ar: "صندوق السقف" }));
    const r = await planExtraLabels(ai, null, { en: "Roof box" });
    expect(r.de).toBe("Dachbox");
    expect(r.fr).toBeNull();
    expect(r.ar).toBe("صندوق السقف");
    expect(r.machineLangs).toEqual(["de", "ar"]);
  });

  it("German output with ß is stored with ss", async () => {
    const ai = stubAi(() => gemmaReply({ de: "Dachbox Straße", fr: "Coffre de toit", ar: "صندوق السقف" }));
    const r = await planExtraLabels(ai, null, { en: "Roof box street" });
    expect(r.de).toBe("Dachbox Strasse");
  });

  it("caps at MAX_LABEL", async () => {
    const long = "Dachbox ".repeat(40).trim();
    const ai = stubAi(() => gemmaReply({ de: long, fr: "Coffre", ar: "صندوق" }));
    const r = await planExtraLabels(ai, null, { en: "Roof box" });
    if (r.de !== null) expect(r.de.length).toBeLessThanOrEqual(MAX_LABEL);
  });
});
