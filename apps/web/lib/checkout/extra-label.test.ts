import { describe, expect, it } from "vitest";
import { extraLabel, humaniseCode } from "./extra-label";

// TEST FIXTURES: `child-seat` is the live row's code, `pet-crate` is invented.
const CHILD_SEAT = { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" };
const PET_CRATE = { en: "Pet crate", de: "Tierbox", fr: "Caisse pour animaux", ar: "صندوق حيوانات أليفة" };

describe("extraLabel", () => {
  it("uses the owner's name in the customer's language", () => {
    for (const locale of ["en", "de", "fr", "ar"] as const) {
      expect(extraLabel(CHILD_SEAT, "child-seat", locale)).toBe(CHILD_SEAT[locale]);
      expect(extraLabel(PET_CRATE, "pet-crate", locale)).toBe(PET_CRATE[locale]);
    }
  });

  it("falls back to the English name, then to the humanised code, never the raw code", () => {
    expect(extraLabel({ en: "Child seat" }, "child-seat", "de")).toBe("Child seat");
    expect(extraLabel({ en: "Child seat", de: "  " }, "child-seat", "de")).toBe("Child seat");
    for (const locale of ["en", "de", "fr", "ar"]) {
      expect(extraLabel({}, "child-seat", locale)).toBe("Child seat");
      expect(extraLabel(null, "pet-crate", locale)).toBe("Pet crate");
      expect(extraLabel(undefined, "pet_crate", locale)).toBe("Pet crate");
      expect(extraLabel({}, "child-seat", locale)).not.toContain("-");
    }
  });

  it("humanises codes", () => {
    expect(humaniseCode("child-seat")).toBe("Child seat");
    expect(humaniseCode("ski_rack")).toBe("Ski rack");
    expect(humaniseCode("x")).toBe("X");
  });
});
