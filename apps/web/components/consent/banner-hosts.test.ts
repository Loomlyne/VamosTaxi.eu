// apps/web/components/consent/banner-hosts.test.ts
//
// Phase 27 (D-07, D-22): the banner element renders wherever the footer renders and
// never on ops, the dashboard host or /dev. SiteShell renders through react-dom/server.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = { pathname: "/" };

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/components/shell/ContactButton", () => ({ ContactButton: () => null }));

import { SiteShell } from "@/components/shell/SiteShell";

function render(pathname: string): string {
  state.pathname = pathname;
  return renderToStaticMarkup(
    createElement(SiteShell, {
      header: createElement("i", { "data-m": "header" }),
      footer: createElement("i", { "data-m": "footer" }),
      banner: createElement("i", { "data-m": "banner" }),
      children: createElement("i", { "data-m": "child" }),
    }),
  );
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
});

describe("banner hosts (D-07)", () => {
  it.each([
    "/",
    "/de",
    "/checkout/details",
    "/de/checkout/details",
    "/confirmation/VT-TEST",
    "/ar/confirmation/VT-TEST",
    "/checkout/pay/abc",
    "/does-not-exist",
    "/contact",
  ])("renders the banner next to the footer on %s", (path) => {
    const html = render(path);
    expect(html).toContain('data-m="banner"');
    expect(html).toContain('data-m="footer"');
  });

  it.each(["/ops", "/ops/board", "/de/ops/board", "/dev/anything", "/fr/dev/components"])(
    "renders no banner on %s",
    (path) => {
      const html = render(path);
      expect(html).not.toContain('data-m="banner"');
      expect(html).not.toContain('data-m="footer"');
      expect(html).toContain('data-m="child"');
    },
  );

  it("renders no banner on the dashboard cookie", () => {
    (globalThis as Record<string, unknown>).window = { location: { hostname: "vamostaxi.site" } };
    (globalThis as Record<string, unknown>).document = { cookie: "a=b; vamos_dash=1" };
    expect(render("/checkout/details")).not.toContain('data-m="banner"');
  });

  it("renders no banner on the dashboard host", () => {
    (globalThis as Record<string, unknown>).window = {
      location: { hostname: "dashboard.vamostaxi.site" },
    };
    (globalThis as Record<string, unknown>).document = { cookie: "" };
    expect(render("/checkout/details")).not.toContain('data-m="banner"');
  });
});
