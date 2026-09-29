import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripeProductName } from "./intent";

const msg = (l: string) =>
  JSON.parse(readFileSync(join(__dirname, "../../i18n/messages", `${l}.json`), "utf8")) as {
    checkout: { stripeProductName: string };
  };

describe("stripeProductName (D-14)", () => {
  it("en is Vamos Taxi transfer", () => {
    expect(stripeProductName("en")).toBe("Vamos Taxi transfer");
  });
  it.each(["de", "fr", "ar"])("%s reads the messages value", (l) => {
    expect(stripeProductName(l)).toBe(msg(l).checkout.stripeProductName);
    expect(stripeProductName(l)).toContain(l === "ar" ? "Vamos Taxi" : "Vamos Taxi");
  });
  it("unknown locale falls back to en", () => {
    expect(stripeProductName("xx")).toBe("Vamos Taxi transfer");
  });
  it("is never Airport transfer", () => {
    for (const l of ["en", "de", "fr", "ar"]) expect(stripeProductName(l)).not.toBe("Airport transfer");
  });
});
