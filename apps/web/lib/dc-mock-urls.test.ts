import { describe, expect, it } from "vitest";
import {
  accountDcPath,
  canonicalPublicFromLeak,
  gatePublicRequest,
  should404MockLeak,
} from "./dc-mock-urls";

function req(path: string, init?: RequestInit & { host?: string }): Request {
  const host = init?.host ?? "vamostaxi.site";
  return new Request(`https://${host}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.headers,
  });
}

function doc(path: string, init?: RequestInit & { host?: string }): Request {
  return req(path, {
    ...init,
    headers: { "sec-fetch-dest": "document", ...init?.headers },
  });
}

describe("account paths", () => {
  it("maps /account and section paths onto the account page", () => {
    expect(accountDcPath("/account")).toBe("/account");
    expect(accountDcPath("/account/preferences")).toBe("/account");
    expect(accountDcPath("/account/security")).toBe("/account");
    expect(accountDcPath("/account/nope")).toBeNull();
    expect(accountDcPath("/account/transfers/extra")).toBeNull();
  });
});

describe("dc mock URL gate", () => {
  it("bounces DC files (dotted or not) to the public path", () => {
    expect(canonicalPublicFromLeak("/app/pages/contact")).toBe("/contact");
    expect(canonicalPublicFromLeak("/app/pages/contact.html")).toBe("/contact");
    expect(canonicalPublicFromLeak("/app/pages/sitemap")).toBe("/sitemap");
    expect(canonicalPublicFromLeak("/app/pages/booking-detail")).toBe("/booking-detail");
    expect(canonicalPublicFromLeak("/app/home/home")).toBe("/");
  });

  it("404s leftover mocks and the /dev gallery", () => {
    expect(should404MockLeak("/app/pages/checkout")).toBe(true);
    expect(should404MockLeak("/app/pages/checkout.html")).toBe(true);
    expect(should404MockLeak("/app/pages/confirmation")).toBe(true);
    expect(should404MockLeak("/app/pages/booking-detail")).toBe(false);
    expect(should404MockLeak("/booking-detail")).toBe(false);
    expect(should404MockLeak("/become-a-partner")).toBe(true);
    expect(should404MockLeak("/dev/components")).toBe(true);
    expect(should404MockLeak("/about")).toBe(false);
    expect(should404MockLeak("/sitemap")).toBe(false);
  });

  it("308s locale-prefixed mock leaks in one hop", () => {
    const gated = gatePublicRequest(doc("/de/app/pages/about.html"));
    expect((gated as Response).status).toBe(308);
    expect((gated as Response).headers.get("location")).toBe(
      "https://vamostaxi.site/about",
    );
  });

  it("308s locale prefixes off the public host", () => {
    const gated = gatePublicRequest(req("/de/about"));
    expect(gated).toBeInstanceOf(Response);
    const res = gated as Response;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://vamostaxi.site/about");
  });

  it("308s /en to the unprefixed path", () => {
    const gated = gatePublicRequest(req("/en/contact"));
    expect((gated as Response).status).toBe(308);
    expect((gated as Response).headers.get("location")).toBe(
      "https://vamostaxi.site/contact",
    );
  });

  it("hides APIs from document navigation and always 404s /api/dev", () => {
    expect(
      gatePublicRequest(
        req("/api/quote", { headers: { "sec-fetch-dest": "document" } }),
      ),
    ).toBe("not-found");
    const dev = gatePublicRequest(req("/api/dev/db-smoke"));
    expect(dev).toBeInstanceOf(Response);
    expect((dev as Response).status).toBe(404);
  });

  it("lets same-origin fetch hit product APIs", () => {
    expect(gatePublicRequest(req("/api/quote", { method: "POST" }))).toBeNull();
    expect(gatePublicRequest(req("/api/geo/suggest"))).toBeNull();
  });

  it("does not serve staff JSON as a document; chauffeur API goes to the fleet page", () => {
    const gated = gatePublicRequest(
      doc("/api/staff/chauffeurs", { host: "dashboard.vamostaxi.site" }),
    );
    expect(gated).toBeInstanceOf(Response);
    const res = gated as Response;
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      "https://dashboard.vamostaxi.site/fleet/chauffeurs",
    );
    expect(
      gatePublicRequest(req("/api/staff/chauffeurs", { host: "dashboard.vamostaxi.site" })),
    ).toBeNull();
  });

  it("lets internal asset fetches through", () => {
    expect(
      gatePublicRequest(
        req("/app/pages/contact.html", {
          headers: { "x-vamos-dc-asset": "1" },
        }),
      ),
    ).toBeNull();
  });

  it("lets DC mocks and scripts through (dashboard must not 308 them to /login)", () => {
    expect(gatePublicRequest(req("/app/pages/support.js"))).toBeNull();
    expect(gatePublicRequest(req("/app/home/SiteHeader.dc.html"))).toBeNull();
    expect(
      gatePublicRequest(
        req("/app/ops/OpsSidebar.dc.html", { host: "dashboard.vamostaxi.site" }),
      ),
    ).toBeNull();
    expect(
      gatePublicRequest(
        req("/app/ops/ops.dc.html", { host: "dashboard.vamostaxi.site" }),
      ),
    ).toBeNull();
  });

  it("308s a public document hit on a mapped mock file", () => {
    const gated = gatePublicRequest(doc("/app/pages/contact.html"));
    expect((gated as Response).status).toBe(308);
    expect((gated as Response).headers.get("location")).toBe(
      "https://vamostaxi.site/contact",
    );
  });
});
