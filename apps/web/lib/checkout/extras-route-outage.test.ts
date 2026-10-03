// 26.2 audit U11-6: a database failure on the extras list is a 503, not an empty list.
import { describe, expect, it, vi } from "vitest";

const state: { fail: boolean } = { fail: false };

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/db/quote", () => ({
  loadLaunchFlags: async () => {
    if (state.fail) throw new Error("db down");
    return { vat_rate_bps: 81 };
  },
}));
vi.mock("@/lib/checkout/checkout-catalog", () => ({
  loadCheckoutCatalog: async () => {
    if (state.fail) throw new Error("db down");
    return [{ code: "child-seat", amountRappen: 1000, labels: { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "x" } }];
  },
}));

import { GET } from "../../app/api/checkout/extras/route";

describe("GET /api/checkout/extras", () => {
  it("answers 503 { ok: false } and no extras when the book cannot be read", async () => {
    state.fail = true;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("still answers ok with the list when the read works", async () => {
    state.fail = false;
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; extras: unknown[]; vat_rate_bps: number };
    expect(json.ok).toBe(true);
    expect(json.extras).toHaveLength(1);
    expect(json.vat_rate_bps).toBe(81);
  });

  it("CheckoutForm keeps the extras it has when the answer is not ok", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/[locale]/checkout/CheckoutForm.tsx"), "utf8");
    expect(src).toContain("if (!res.ok || json.ok !== true) {");
    expect(src).not.toMatch(/catch \{\s+setExtras\(\[\]\)/);
  });
});
