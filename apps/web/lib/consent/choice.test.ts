import { describe, expect, it } from "vitest";
import { categoriesForChoice, needsTurnstile } from "./choice";

describe("categoriesForChoice (27 D-05)", () => {
  it("accept_all is all true and ignores the body", () => {
    expect(categoriesForChoice("accept_all", { marketing: false })).toEqual({
      ok: true,
      categories: { functional: true, analytics: true, marketing: true },
    });
  });
  it("reject_all is all false and ignores the body", () => {
    expect(categoriesForChoice("reject_all", { marketing: true, analytics: true })).toEqual({
      ok: true,
      categories: { functional: false, analytics: false, marketing: false },
    });
  });
  it("settings_change writes exactly the switches sent", () => {
    expect(
      categoriesForChoice("settings_change", { functional: false, analytics: true, marketing: true }),
    ).toEqual({ ok: true, categories: { functional: false, analytics: true, marketing: true } });
  });
  it("settings_change rejects a missing switch", () => {
    expect(categoriesForChoice("settings_change", { functional: true, analytics: true })).toEqual({ ok: false });
  });
  it("settings_change rejects string and number switches", () => {
    expect(
      categoriesForChoice("settings_change", { functional: true, analytics: true, marketing: "true" }),
    ).toEqual({ ok: false });
    expect(
      categoriesForChoice("settings_change", { functional: true, analytics: 1, marketing: false }),
    ).toEqual({ ok: false });
  });
});

describe("needsTurnstile (27 D-33)", () => {
  it("is true only when marketing is true", () => {
    expect(needsTurnstile({ functional: true, analytics: true, marketing: true })).toBe(true);
    expect(needsTurnstile({ functional: true, analytics: true, marketing: false })).toBe(false);
    expect(needsTurnstile({ functional: false, analytics: false, marketing: false })).toBe(false);
  });
});
