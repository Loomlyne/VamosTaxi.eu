import { describe, expect, it } from "vitest";
import { normaliseSource, sourceHash } from "./hash";
import { postProcess } from "./post-process";

describe("postProcess", () => {
  it("German: ß becomes ss and ẞ becomes SS", () => {
    expect(postProcess("de", "Strasse groß ẞ")).toBe("Strasse gross SS");
  });

  it("Arabic: Arabic-Indic and Persian digits become 0-9", () => {
    expect(postProcess("ar", "٣ ۴")).toBe("3 4");
    expect(postProcess("ar", "٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789 0123456789");
  });

  it("leaves ß and digits alone in other languages", () => {
    expect(postProcess("fr", "Straße ٣")).toBe("Straße ٣");
  });

  it("trims and collapses doubled spaces, keeping line breaks", () => {
    expect(postProcess("fr", "  Votre   chauffeur  attend \n Merci ")).toBe("Votre chauffeur attend \n Merci");
  });

  it("strips wrapping quotes the source did not have", () => {
    expect(postProcess("de", "«Ihr Fahrer wartet»", "Your driver is waiting")).toBe("Ihr Fahrer wartet");
    expect(postProcess("fr", '"Votre chauffeur attend"', "Your driver is waiting")).toBe("Votre chauffeur attend");
    expect(postProcess("de", "„Hallo“", "Hello")).toBe("Hallo");
  });

  it("keeps wrapping quotes the source had", () => {
    expect(postProcess("de", "«Hallo»", '"Hello"')).toBe("«Hallo»");
  });

  it("keeps quotes that do not wrap the whole text", () => {
    expect(postProcess("de", "Wählen Sie «Buchen» jetzt", "Choose “Book” now")).toBe("Wählen Sie «Buchen» jetzt");
  });
});

describe("sourceHash", () => {
  it("normalises NFC, trims and collapses whitespace", async () => {
    expect(normaliseSource(" a  b ")).toBe("a b");
    expect(normaliseSource("Café")).toBe("Café");
    expect(await sourceHash("en", " a  b ")).toBe(await sourceHash("en", "a b"));
  });

  it("differs for another source language", async () => {
    expect(await sourceHash("en", "a b")).not.toBe(await sourceHash("de", "a b"));
  });

  it("is 64 hex characters", async () => {
    expect(await sourceHash("en", "Your driver is waiting")).toMatch(/^[0-9a-f]{64}$/);
  });
});
