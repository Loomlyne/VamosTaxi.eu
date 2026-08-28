// apps/web/lib/quote/preprocess.test.ts
//
// D-04: named preprocessing, not an inline replace in the handler.

import { describe, expect, it } from "vitest";
import { preprocessWidgetTokens } from "./preprocess";

describe("preprocessWidgetTokens", () => {
  it("maps one-way to one_way before the strict union", () => {
    const result = preprocessWidgetTokens({ mode: "one-way", pax: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.mode).toBe("one_way");
  });

  it("maps hourly to mode_not_offered — a product answer, not untrusted_input", () => {
    const result = preprocessWidgetTokens({ mode: "hourly" });
    expect(result).toEqual({ ok: false, code: "mode_not_offered" });
  });

  it("leaves hours in place so the unknown-key walk can refuse it", () => {
    const result = preprocessWidgetTokens({
      mode: "one_way",
      hours: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.hours).toBe(3);
    expect(result.body.mode).toBe("one_way");
  });

  it("refuses a non-object body as untrusted_input", () => {
    expect(preprocessWidgetTokens(null)).toEqual({
      ok: false,
      code: "untrusted_input",
    });
    expect(preprocessWidgetTokens("hourly")).toEqual({
      ok: false,
      code: "untrusted_input",
    });
  });
});
