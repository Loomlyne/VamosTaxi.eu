import { describe, expect, it } from "vitest";
import {
  authOriginAllowed,
  csrfForbidden,
  publicOriginAllowed,
  trustedSiteOrigin,
} from "./origin";

describe("publicOriginAllowed", () => {
  it("denies missing Origin", () => {
    expect(publicOriginAllowed(null)).toBe(false);
    expect(publicOriginAllowed("")).toBe(false);
  });

  it("allows public site and localhost http", () => {
    expect(publicOriginAllowed("https://vamostaxi.site")).toBe(true);
    expect(publicOriginAllowed("https://www.vamostaxi.site")).toBe(true);
    expect(publicOriginAllowed("http://localhost")).toBe(true);
  });

  it("denies dashboard and foreign hosts", () => {
    expect(publicOriginAllowed("https://dashboard.vamostaxi.site")).toBe(false);
    expect(publicOriginAllowed("https://evil.example")).toBe(false);
    expect(publicOriginAllowed("https://vamostaxi.eu")).toBe(false);
    expect(publicOriginAllowed("https://other.workers.dev")).toBe(false);
  });
});

describe("authOriginAllowed", () => {
  it("allows public site and dashboard", () => {
    expect(authOriginAllowed("https://vamostaxi.site")).toBe(true);
    expect(authOriginAllowed("https://dashboard.vamostaxi.site")).toBe(true);
    expect(authOriginAllowed("http://dashboard.localhost")).toBe(true);
  });

  it("denies foreign hosts", () => {
    expect(authOriginAllowed(null)).toBe(false);
    expect(authOriginAllowed("https://evil.example")).toBe(false);
    expect(authOriginAllowed("https://vamostaxi.eu")).toBe(false);
  });
});

describe("csrfForbidden", () => {
  it("returns 403 csrf without Origin", () => {
    const res = csrfForbidden(new Request("https://vamostaxi.site/api/account/prefs", { method: "POST" }));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
  });

  it("returns null for public Origin", () => {
    const res = csrfForbidden(
      new Request("https://vamostaxi.site/api/account/prefs", {
        method: "POST",
        headers: { Origin: "https://vamostaxi.site" },
      }),
    );
    expect(res).toBeNull();
  });

  it("auth kind allows dashboard Origin", () => {
    const res = csrfForbidden(
      new Request("https://vamostaxi.site/api/auth", {
        method: "POST",
        headers: { Origin: "https://dashboard.vamostaxi.site" },
      }),
      "auth",
    );
    expect(res).toBeNull();
  });
});

describe("trustedSiteOrigin", () => {
  it("accepts allowlisted Host and ignores x-forwarded-host injection", () => {
    expect(trustedSiteOrigin("vamostaxi.site")).toBe("https://vamostaxi.site");
    expect(trustedSiteOrigin("dashboard.vamostaxi.site")).toBe("https://dashboard.vamostaxi.site");
    expect(trustedSiteOrigin("localhost:3000")).toBe("http://localhost:3000");
    expect(trustedSiteOrigin("evil.example")).toBeNull();
    expect(trustedSiteOrigin("vamostaxi.eu")).toBeNull();
    expect(trustedSiteOrigin("evil.example, vamostaxi.site")).toBeNull();
  });
});
