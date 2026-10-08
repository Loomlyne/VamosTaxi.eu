// J6 (W2-04): the charge path reads the VAT rate strictly. The display loader answers 8.1 % on any
// failure; the strict one throws, so Pay and the screen's price refuse `pricing_not_live` instead.
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ run: (async () => null) as (fn: (sql: unknown) => unknown) => Promise<unknown> }));
vi.mock("./identity", () => ({
  asCheckout: (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) => state.run(fn),
}));

import { LaunchFlagsUnavailableError, loadLaunchFlags, loadLaunchFlagsStrict, strictVatRateBps } from "./quote";

const env = {} as CloudflareEnv;

function answers(result: unknown) {
  state.run = async (fn) => fn(() => Promise.resolve([{ result }]));
}
function fails() {
  state.run = async () => {
    throw new Error("db down");
  };
}

describe("strictVatRateBps", () => {
  it("takes a non-negative number or a short digit string, nothing else", () => {
    expect(strictVatRateBps(81)).toBe(81);
    expect(strictVatRateBps(0)).toBe(0);
    expect(strictVatRateBps("77")).toBe(77);
    for (const bad of [undefined, null, "", "x", -1, Number.NaN, "8.1", "12345", {}]) {
      expect(strictVatRateBps(bad), String(bad)).toBeNull();
    }
  });
});

describe("loadLaunchFlagsStrict versus the display loader", () => {
  it("a failed read: strict throws, display answers 8.1 %", async () => {
    fails();
    await expect(loadLaunchFlagsStrict(env)).rejects.toBeInstanceOf(LaunchFlagsUnavailableError);
    expect(await loadLaunchFlags(env)).toEqual({ public_chf: false, vat_rate_bps: 81 });
  });

  it("an answer with no VAT rate: strict throws, display falls back to 81", async () => {
    answers({ public_chf: true });
    await expect(loadLaunchFlagsStrict(env)).rejects.toBeInstanceOf(LaunchFlagsUnavailableError);
    expect((await loadLaunchFlags(env)).vat_rate_bps).toBe(81);
  });

  it("an answer with no launch flags at all: strict throws", async () => {
    answers({});
    await expect(loadLaunchFlagsStrict(env)).rejects.toBeInstanceOf(LaunchFlagsUnavailableError);
    answers(null);
    await expect(loadLaunchFlagsStrict(env)).rejects.toBeInstanceOf(LaunchFlagsUnavailableError);
  });

  it("a real answer is returned as is, including a rate that is not 81", async () => {
    answers({ public_chf: true, vat_rate_bps: 77 });
    expect(await loadLaunchFlagsStrict(env)).toEqual({ public_chf: true, vat_rate_bps: 77 });
    answers({ public_chf: false, vat_rate_bps: "81" });
    expect(await loadLaunchFlagsStrict(env)).toEqual({ public_chf: false, vat_rate_bps: 81 });
  });
});
