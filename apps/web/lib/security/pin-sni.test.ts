import { describe, expect, it } from "vitest";
import { pinUrlToSni, sniFromCf } from "./pin-sni";

describe("sniFromCf", () => {
  it("reads tlsServerName", () => {
    expect(sniFromCf({ tlsServerName: "vamostaxi.site" })).toBe("vamostaxi.site");
  });
  it("returns null when missing", () => {
    expect(sniFromCf({})).toBeNull();
    expect(sniFromCf(null)).toBeNull();
  });
});

describe("pinUrlToSni", () => {
  it("rewrites dashboard Host on apex SNI", () => {
    const url = new URL("https://dashboard.vamostaxi.site/about");
    const pinned = pinUrlToSni(url, "vamostaxi.site");
    expect(pinned.hostname).toBe("vamostaxi.site");
    expect(pinned.pathname).toBe("/about");
  });
  it("leaves a real dashboard visit alone", () => {
    const url = new URL("https://dashboard.vamostaxi.site/ops");
    expect(pinUrlToSni(url, "dashboard.vamostaxi.site").href).toBe(url.href);
  });
  it("no-ops without SNI", () => {
    const url = new URL("https://dashboard.vamostaxi.site/about");
    expect(pinUrlToSni(url, null).href).toBe(url.href);
  });
  it("does not rewrite unknown hosts", () => {
    const url = new URL("https://evil.example/about");
    expect(pinUrlToSni(url, "vamostaxi.site").href).toBe(url.href);
  });
});
