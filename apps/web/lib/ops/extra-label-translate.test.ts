import { describe, expect, it, vi } from "vitest";
import { translateExtraName } from "./extra-label-translate";

const ai = (map: Record<string, string | Error>) => ({
  run: vi.fn(async (_m: string, input: Record<string, unknown>) => {
    const v = map[String(input.target_lang)];
    if (v instanceof Error) throw v;
    return { translated_text: v };
  }),
});

describe("translateExtraName", () => {
  it("returns de/fr/ar and swaps ß for ss", async () => {
    const out = await translateExtraName(ai({ german: " Dachbox Straße ", french: "Coffre", arabic: "صندوق" }), "Roof box");
    expect(out).toEqual({ de: "Dachbox Strasse", fr: "Coffre", ar: "صندوق" });
  });
  it("drops only the language that failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await translateExtraName(ai({ german: "Dachbox", french: new Error("x"), arabic: "صندوق" }), "Roof box");
    expect(out).toEqual({ de: "Dachbox", ar: "صندوق" });
  });
  it("returns {} without a binding", async () => {
    expect(await translateExtraName(undefined, "Roof box")).toEqual({});
  });
  it("caps at 80 chars", async () => {
    const out = await translateExtraName(ai({ german: "a".repeat(200), french: "", arabic: "" }), "Roof box");
    expect(out.de).toHaveLength(80);
    expect(out.fr).toBeUndefined();
  });
});
