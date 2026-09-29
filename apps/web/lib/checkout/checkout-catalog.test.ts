import { describe, expect, it } from "vitest";
import { loadCheckoutCatalog } from "./checkout-catalog";

const ENV = {} as CloudflareEnv;

const book = {
  surcharges: [
    { code: "roof-box", kind: "amount", amount_rappen: 2000, active: true, quantity_source: null, predicate: { kind: "manual" } },
    { code: "baby_shell", kind: "amount", amount_rappen: 1500, active: true, quantity_source: null, predicate: { kind: "manual" } },
  ],
};

describe("loadCheckoutCatalog", () => {
  it("lists every selectable extra with four names", async () => {
    const rows = await loadCheckoutCatalog(ENV, {
      loadBook: async () => book,
      loadLabels: async () => ({
        "roof-box": { en: "Roof box", de: "Dachbox", fr: "Coffre de toit", ar: "صندوق السقف" },
        baby_shell: { en: "Baby shell" },
      }),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      code: "roof-box",
      amountRappen: 2000,
      labels: { en: "Roof box", de: "Dachbox", fr: "Coffre de toit", ar: "صندوق السقف" },
    });
    expect(rows[1]!.labels.de).toBe("Baby shell");
  });

  it("falls back to the humanised code when no label row exists", async () => {
    const rows = await loadCheckoutCatalog(ENV, { loadBook: async () => book, loadLabels: async () => ({}) });
    expect(rows[0]!.labels).toEqual({ en: "Roof box", de: "Roof box", fr: "Roof box", ar: "Roof box" });
  });

  it("gives an empty list for an empty book", async () => {
    expect(await loadCheckoutCatalog(ENV, { loadBook: async () => null, loadLabels: async () => ({}) })).toEqual([]);
  });

  it("throws when the book cannot be loaded, so callers fail closed", async () => {
    await expect(
      loadCheckoutCatalog(ENV, {
        loadBook: async () => {
          throw new Error("db down");
        },
        loadLabels: async () => ({}),
      }),
    ).rejects.toThrow("db down");
  });
});
