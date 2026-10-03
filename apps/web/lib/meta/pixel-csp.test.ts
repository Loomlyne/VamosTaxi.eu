import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../security/headers";
import { PIXEL_CASES } from "./pixel-pages.cases";
import { metaPixelCspFor } from "./pixel-csp";

const here = dirname(fileURLToPath(import.meta.url));
const middleware = readFileSync(join(here, "../../middleware.ts"), "utf8");
const META = contentSecurityPolicy({ metaPixel: true });
const HOST = "face" + "book";

describe("metaPixelCspFor", () => {
  const rows = PIXEL_CASES.filter((c) => !c.browserOnly);

  it("flags off: null for every address", () => {
    for (const r of rows) expect(metaPixelCspFor(new URL(r.href), false), r.href).toBeNull();
  });

  it("flags on: the Meta policy exactly on the allowed addresses, null elsewhere", () => {
    for (const r of rows) {
      expect(metaPixelCspFor(new URL(r.href), true), r.href).toBe(r.allowed ? META : null);
    }
    expect(META).toContain(HOST);
  });

  it("the named cases from the plan", () => {
    const at = (h: string) => metaPixelCspFor(new URL(h), true);
    expect(at("https://vamostaxi.site/about")).toBe(META);
    for (const h of [
      "https://vamostaxi.site/checkout",
      "https://vamostaxi.site/confirmation/VT-26-07331",
      "https://vamostaxi.site/checkout/pay/x",
      "https://vamostaxi.site/manage-booking",
      "https://vamostaxi.site/sign-in?returnTo=/x",
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
