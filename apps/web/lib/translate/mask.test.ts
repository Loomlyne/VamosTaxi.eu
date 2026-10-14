import { describe, expect, it } from "vitest";
import { PROTECTED_LITERALS } from "./glossary";
import { icuSignature, mask, unmask } from "./mask";

function roundTrip(text: string) {
  const m = mask(text);
  expect(unmask(m.masked, m.tokens)).toBe(text);
  return m;
}

describe("mask", () => {
  it("masks a ref, ZRH and a flight number in order of appearance and restores the source", () => {
    const text = "Your driver VT-26-0753 waits at ZRH for flight LX 318";
    const m = roundTrip(text);
    expect(m.masked).toBe("Your driver ⟦0⟧ waits at ⟦1⟧ for flight ⟦2⟧");
    expect(m.tokens).toEqual(["VT-26-0753", "ZRH", "LX 318"]);
  });

  it("masks the ICU plural head, keys and #, keeping the branch words translatable", () => {
    const text = "{count, plural, one {# trip} other {# trips}}";
    const m = roundTrip(text);
    expect(m.masked).toContain(" trip");
    expect(m.masked).toContain(" trips");
    expect(m.masked).not.toMatch(/count|plural|one|other|#|[{}]/);
    expect(m.tokens.join("")).toContain("{count, plural, one {");
    expect(m.tokens).toContain("#");
  });

  it("masks a whole ICU argument and a select head", () => {
    expect(roundTrip("Hello {name}, welcome").masked).toBe("Hello ⟦0⟧, welcome");
    const sel = roundTrip("{side, select, pickup {Pickup} other {Drop-off}} point");
    expect(sel.masked).toContain("Pickup");
    expect(sel.masked).toContain("Drop-off");
    expect(sel.masked).not.toMatch(/side|select|[{}]/);
  });

  it("masks dictionary $1, HTML tags and a whole data-tok span", () => {
    const m = roundTrip('Saved on $1 <b>within</b> the <span data-tok>free cancel window</span> before pickup');
    expect(m.masked).toBe("Saved on ⟦0⟧ ⟦1⟧within⟦2⟧ the ⟦3⟧ before pickup");
    expect(m.tokens[3]).toBe("<span data-tok>free cancel window</span>");
  });

  it("masks URLs and e-mail addresses without trailing punctuation", () => {
    const m = roundTrip("Write to help@vamostaxi.eu or see https://vamostaxi.site/faq.");
    expect(m.masked).toBe("Write to ⟦0⟧ or see ⟦1⟧.");
    expect(m.tokens).toEqual(["help@vamostaxi.eu", "https://vamostaxi.site/faq"]);
  });

  it("masks the CHF 000 placeholder as one span", () => {
    const m = roundTrip("Total CHF 000 today");
    expect(m.masked).toBe("Total ⟦0⟧ today");
    expect(m.tokens).toEqual(["CHF 000"]);
  });

  it("masks every glossary literal", () => {
    for (const lit of PROTECTED_LITERALS) {
      const m = roundTrip(`Book ${lit} now`);
      expect(m.tokens).toEqual([lit]);
      expect(m.masked).toBe("Book ⟦0⟧ now");
    }
    const m = roundTrip("Vamos Taxi. Ride with class. Economy Sedan, Economy Van or Luxury Van; pay by TWINT, Visa, Mastercard or Apple Pay in CHF.");
    expect(m.tokens).toEqual([
      "Vamos Taxi", "Ride with class", "Economy Sedan", "Economy Van", "Luxury Van",
      "TWINT", "Visa", "Mastercard", "Apple Pay", "CHF",
    ]);
  });

  it("protects a token-shaped run already in the source", () => {
    const m = roundTrip("odd ⟦7⟧ text");
    expect(m.masked).toBe("odd ⟦0⟧ text");
  });

  it("leaves plain text alone", () => {
    expect(mask("Your driver is waiting")).toEqual({ masked: "Your driver is waiting", tokens: [] });
    expect(roundTrip("Broken { brace").tokens).toEqual([]);
  });
});

describe("unmask", () => {
  const { masked, tokens } = mask("Flight LX 318 lands at ZRH");

  it("restores tokens in any order", () => {
    expect(unmask("⟦1⟧: ⟦0⟧", tokens)).toBe("ZRH: LX 318");
    expect(masked).toBe("Flight ⟦0⟧ lands at ⟦1⟧");
  });

  it("returns null on a missing token", () => {
    expect(unmask("Flight ⟦0⟧ lands", tokens)).toBeNull();
  });

  it("returns null on a duplicated token", () => {
    expect(unmask("⟦0⟧ ⟦0⟧ ⟦1⟧", tokens)).toBeNull();
  });

  it("returns null on an unknown or damaged token", () => {
    expect(unmask("⟦0⟧ ⟦1⟧ ⟦2⟧", tokens)).toBeNull();
    expect(unmask("⟦0⟧ ⟦ 1 ⟧", tokens)).toBeNull();
    expect(unmask("⟦0⟧ ⟦1", tokens)).toBeNull();
  });
});

describe("icuSignature", () => {
  it("is null for non-ICU text", () => {
    expect(icuSignature("Plain text")).toBeNull();
    expect(icuSignature("Broken { brace")).toBeNull();
  });

  it("lists argument names and plural/select keys, independent of the branch words", () => {
    const a = icuSignature("{count, plural, one {# trip} other {# trips}} for {name}");
    const b = icuSignature("{count, plural, one {# Fahrt} other {# Fahrten}} für {name}");
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(icuSignature("{count, plural, other {# trips}} for {name}")).not.toBe(a);
    expect(icuSignature("{count, plural, one {# trip} other {# trips}} for {person}")).not.toBe(a);
  });
});
