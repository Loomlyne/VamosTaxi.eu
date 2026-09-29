import { describe, expect, it } from "vitest";
import { validateAuthRedirectTarget } from "./redirect-target";

const co = "/checkout?from=zrh&to=bern&d=2026-10-01";

describe("callback target (D-13)", () => {
  it("keeps a checkout URL with its query", () => {
    expect(validateAuthRedirectTarget(co, "en")).toBe(co);
    expect(validateAuthRedirectTarget("/de/checkout?a=1", "de")).toBe("/de/checkout?a=1");
  });
  it("keeps existing public routes", () => {
    expect(validateAuthRedirectTarget("/", "en")).toBe("/");
    expect(validateAuthRedirectTarget("/de/account", "de")).toBe("/de/account");
  });
  it.each(["//evil.com", "https://evil", "/%2F%2Fevil", "/\\evil.com", "/checkout/../x", "/checkout/extra"])(
    "rejects %s",
    (bad) => {
      expect(validateAuthRedirectTarget(bad, "en")).toBe("/account");
    },
  );
  it("defaults to /account", () => {
    expect(validateAuthRedirectTarget(null, "en")).toBe("/account");
    expect(validateAuthRedirectTarget(null, "fr")).toBe("/fr/account");
  });
});

describe("callback target with a bad query", () => {
  it("drops the query, never keeps it", () => {
    expect(validateAuthRedirectTarget("/checkout?a=b\\c", "en")).toBe("/checkout");
  });
});
