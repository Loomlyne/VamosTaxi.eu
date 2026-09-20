import { describe, expect, it } from "vitest";
import {
  isApexAssetPath,
  pinRequestToApexAssets,
  pinUrlToSni,
  pinUrlToSurface,
  sniFromCf,
  surfaceFromEnv,
} from "./pin-sni";

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

describe("pinUrlToSurface", () => {
  it("public ignores Host dashboard on apex", () => {
    const url = new URL("https://dashboard.vamostaxi.site/about");
    const pinned = pinUrlToSurface(url, "public");
    expect(pinned.hostname).toBe("vamostaxi.site");
    expect(pinned.pathname).toBe("/about");
  });
  it("public leaves www and apex", () => {
    expect(
      pinUrlToSurface(new URL("https://www.vamostaxi.site/faq"), "public")
        .hostname,
    ).toBe("www.vamostaxi.site");
    expect(
      pinUrlToSurface(new URL("https://vamostaxi.site/about"), "public")
        .hostname,
    ).toBe("vamostaxi.site");
  });
  it("public pins leftover ops-changes Host to apex (K93)", () => {
    expect(
      pinUrlToSurface(
        new URL("https://vamos-ops-changes.koussayzayeni.workers.dev/login"),
        "public",
      ).hostname,
    ).toBe("vamostaxi.site");
    expect(
      pinUrlToSurface(new URL("https://evil.example/about"), "public").hostname,
    ).toBe("vamostaxi.site");
  });
  it("dashboard ignores Host apex", () => {
    const url = new URL("https://vamostaxi.site/about");
    expect(pinUrlToSurface(url, "dashboard").hostname).toBe(
      "dashboard.vamostaxi.site",
    );
  });
  it("auto without SNI leaves spoofed Host", () => {
    const url = new URL("https://dashboard.vamostaxi.site/about");
    expect(pinUrlToSurface(url, "auto", null).href).toBe(url.href);
  });
});

describe("surfaceFromEnv", () => {
  it("reads VAMOS_SURFACE", () => {
    expect(surfaceFromEnv({ VAMOS_SURFACE: "public" })).toBe("public");
    expect(surfaceFromEnv({ VAMOS_SURFACE: "dashboard" })).toBe("dashboard");
  });
  it("ops-changes is dashboard", () => {
    expect(surfaceFromEnv({ DEPLOY_ENV: "ops-changes" })).toBe("dashboard");
  });
  it("staging without surface stays auto", () => {
    expect(surfaceFromEnv({ DEPLOY_ENV: "staging" })).toBe("auto");
  });
});

describe("K92 apex asset pin", () => {
  it("rewrites dashboard /app/ops HTML to apex; leaves /login", () => {
    expect(isApexAssetPath("/login")).toBe(false);
    expect(isApexAssetPath("/dashboard")).toBe(false);
    expect(isApexAssetPath("/api/staff/me")).toBe(false);
    expect(isApexAssetPath("/app/ops/ops-login.dc.html")).toBe(true);
    expect(isApexAssetPath("/_next/static/chunks/x.js")).toBe(true);
    const dash = new Request("https://dashboard.vamostaxi.site/app/ops/ops-login.dc.html");
    const pinned = pinRequestToApexAssets(dash);
    expect(new URL(pinned.url).hostname).toBe("vamostaxi.site");
    expect(new URL(pinned.url).pathname).toBe("/app/ops/ops-login.dc.html");
    const login = new Request("https://dashboard.vamostaxi.site/login");
    expect(pinRequestToApexAssets(login)).toBe(login);
  });
});
