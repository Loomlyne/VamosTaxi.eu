import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CH_VAT_RATE_BPS,
  payableWithVatRappen,
  vatIncludedRappen,
  vatOnTopRappen,
  vatPercentLabel,
} from "./vat";

describe("vatIncludedRappen", () => {
  it("takes 8.1% out of a Van floor without adding on top", () => {
    expect(vatIncludedRappen(15_000)).toBe(1_124);
  });

  it("matches the four live class floors", () => {
    expect(vatIncludedRappen(8_000)).toBe(599);
    expect(vatIncludedRappen(10_000)).toBe(749);
    expect(vatIncludedRappen(13_000)).toBe(974);
    expect(vatIncludedRappen(15_000)).toBe(1_124);
  });

  it("does not invent a slice when the lock is empty", () => {
    expect(vatIncludedRappen(0)).toBe(0);
    expect(vatIncludedRappen(-1)).toBe(0);
    expect(vatIncludedRappen(Number.NaN)).toBe(0);
  });
});

describe("vatOnTopRappen", () => {
  it("adds 8.1% on 120.00 net (fare 100 + child seat 20)", () => {
    expect(vatOnTopRappen(12_000)).toBe(972);
    expect(payableWithVatRappen(12_000)).toBe(12_972);
  });

  it("adds 8.1% on the four class floors", () => {
    expect(vatOnTopRappen(8_000)).toBe(648);
    expect(payableWithVatRappen(8_000)).toBe(8_648);
    expect(vatOnTopRappen(10_000)).toBe(810);
    expect(payableWithVatRappen(10_000)).toBe(10_810);
    expect(vatOnTopRappen(13_000)).toBe(1_053);
    expect(payableWithVatRappen(13_000)).toBe(14_053);
    expect(vatOnTopRappen(15_000)).toBe(1_215);
    expect(payableWithVatRappen(15_000)).toBe(16_215);
  });

  it("does not invent VAT when the net is empty", () => {
    expect(vatOnTopRappen(0)).toBe(0);
    expect(vatOnTopRappen(-1)).toBe(0);
    expect(vatOnTopRappen(Number.NaN)).toBe(0);
    expect(payableWithVatRappen(0)).toBe(0);
  });
});

describe("injected bps / fallback 81 (D-22)", () => {
  it("CH_VAT_RATE_BPS is 81, not 7.7", () => {
    expect(CH_VAT_RATE_BPS).toBe(81);
    expect(CH_VAT_RATE_BPS).not.toBe(77);
  });

  it("omitted bps falls back to 81", () => {
    expect(vatOnTopRappen(10_000)).toBe(810);
    expect(payableWithVatRappen(10_000)).toBe(10_810);
  });

  it("vatOnTopRappen(net, bps) uses the argument; omitted bps falls back to 81", () => {
    expect(vatOnTopRappen(10_000, 81)).toBe(810);
    expect(payableWithVatRappen(10_000, 81)).toBe(10_810);
    expect(vatOnTopRappen(10_000)).toBe(810);
  });

  it("vatOnTopRappen(10000, 0) is 0; payable keeps the net", () => {
    expect(vatOnTopRappen(10_000, 0)).toBe(0);
    expect(payableWithVatRappen(10_000, 0)).toBe(10_000);
  });

  it("null bps falls back to 81", () => {
    expect(vatOnTopRappen(10_000, null)).toBe(810);
    expect(payableWithVatRappen(10_000, null)).toBe(10_810);
  });
});

describe("intent / receipt pass settings bps (D-22)", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("the web runner charges through checkoutCharge with the settings vatRateBps and returns amount_rappen", () => {
    const intent = readFileSync(join(here, "intent.ts"), "utf8");
    expect(intent).toMatch(/checkoutCharge\(\{[^}]*vatRateBps,/s);
    expect(intent).toMatch(/amount_rappen:\s*charged/);
    expect(intent).toContain("loadLaunchFlags");
  });

  it("receipt VAT line passes vatRateBps into vatOnTopRappen", () => {
    const receipt = readFileSync(join(here, "confirmation-receipt.ts"), "utf8");
    expect(receipt).toMatch(/vatOnTopRappen\(fareRappen \+ extraSum, args\.vatRateBps\)/);
  });
});

describe("vatPercentLabel (26.2 audit: /checkout and the pay link showed 0.81 %)", () => {
  it("reads the tenths-of-a-percent scale as the customer reads it", () => {
    expect(vatPercentLabel(81)).toBe("8.1");
    expect(vatPercentLabel(77)).toBe("7.7");
    expect(vatPercentLabel(80)).toBe("8");
    expect(vatPercentLabel(0)).toBe("0");
    expect(vatPercentLabel(null)).toBe("");
    expect(vatPercentLabel(Number.NaN)).toBe("");
  });

  it("both customer price pages use it, and no page divides the rate by 100", () => {
    for (const rel of ["../../app/[locale]/checkout/sections/SummaryRail.tsx", "../../app/[locale]/checkout/pay/[token]/PayClient.tsx"]) {
      const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), rel), "utf8");
      expect(src, rel).toContain("vatPercentLabel(");
      expect(src, rel).not.toMatch(/[Bb]ps\s*\/\s*100\b/);
    }
  });
});

