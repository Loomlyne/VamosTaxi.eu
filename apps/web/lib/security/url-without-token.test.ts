import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { urlWithoutToken } from "./url-without-token";

describe("urlWithoutToken", () => {
  it("drops the token and keeps every other part", () => {
    expect(urlWithoutToken("https://vamostaxi.site/de/review?token=abc&bookingRef=VT-1#top")).toBe(
      "/de/review?bookingRef=VT-1#top",
    );
    expect(urlWithoutToken("https://vamostaxi.site/review?token=abc")).toBe("/review");
  });

  it("returns null when there is nothing to remove or the address is not a URL", () => {
    expect(urlWithoutToken("https://vamostaxi.site/review?bookingRef=VT-1")).toBeNull();
    expect(urlWithoutToken("not a url")).toBeNull();
  });

  it("the review form strips the token from the address bar once it holds it", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const form = readFileSync(join(here, "../../app/[locale]/review/ReviewForm.tsx"), "utf8");
    expect(form).toContain("urlWithoutToken(window.location.href)");
    expect(form).toContain("window.history.replaceState");
  });
});
