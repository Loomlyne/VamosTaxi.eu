import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { googlePageAllowed } from "../google/google-pages";
import { contentSecurityPolicy } from "../security/headers";
import { PIXEL_CASES } from "./pixel-pages.cases";
import { metaPixelCspFor } from "./pixel-csp";

const here = dirname(fileURLToPath(import.meta.url));
const middleware = readFileSync(join(here, "../../middleware.ts"), "utf8");
const META = contentSecurityPolicy({ metaPixel: true });
const GOOGLE = contentSecurityPolicy({ metaPixel: false, googleTag: true });
const BOTH = contentSecurityPolicy({ metaPixel: true, googleTag: true });
const HOST = "face" + "book";

describe("metaPixelCspFor", () => {
  const rows = PIXEL_CASES.filter((c) => !c.browserOnly);

  it("meta measurement off: Google's policy on the Google list, null elsewhere", () => {
    for (const r of rows) {
      const url = new URL(r.href);
      const csp = metaPixelCspFor(url, false);
      expect(csp, r.href).toBe(googlePageAllowed(url) ? GOOGLE : null);
    }
  });

  it("meta measurement on: Meta and Google together on a Meta page, Google alone on its extra pages, null elsewhere", () => {
    for (const r of rows) {
      const url = new URL(r.href);
      const csp = metaPixelCspFor(url, true);
      if (r.allowed) expect(csp, r.href).toBe(BOTH);
      else expect(csp, r.href).toBe(googlePageAllowed(url) ? GOOGLE : null);
    }
    expect(BOTH).toContain(HOST);
    expect(META).toContain(HOST);
  });

  it("the named cases from the plan", () => {
    const at = (h: string) => metaPixelCspFor(new URL(h), true);
    expect(at("https://vamostaxi.site/about")).toBe(BOTH);
    expect(at("https://vamostaxi.site/checkout")).toBe(GOOGLE);
    expect(at("https://vamostaxi.site/confirmation/VT-26-07331")).toBe(GOOGLE);
    // The path is on the Google list. The query is not sent. Meta still refuses this address.
    expect(at("https://vamostaxi.site/sign-in?returnTo=/x")).toBe(GOOGLE);
    for (const h of [
      "https://vamostaxi.site/checkout/pay/x",
      "https://vamostaxi.site/manage-booking",
      "https://vamostaxi.site/ops",
      "https://dashboard.vamostaxi.site/about",
    ]) {
      expect(at(h), h).toBeNull();
    }
  });
});

describe("middleware wiring (source pin)", () => {
  it("calls metaPixelCspFor once, in the block that serves mock HTML", () => {
    expect(middleware.match(/metaPixelCspFor\(/g)).toHaveLength(1);
    const call = middleware.indexOf("metaPixelCspFor(");
    const serve = middleware.indexOf("serveDcHtml(request, mock)");
    expect(serve).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(serve);
    expect(call - serve).toBeLessThan(900);
  });

  it("serveDcHtml itself knows nothing about the pixel", () => {
    const start = middleware.indexOf("async function serveDcHtml");
    const rest = middleware.slice(start + 10);
    const next = rest.search(/\n(?:async )?function /);
    const body = middleware.slice(start, next === -1 ? middleware.length : start + 10 + next);
    expect(body.toLowerCase()).not.toContain("pixel");
  });
});
