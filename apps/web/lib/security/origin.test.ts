import { describe, expect, it } from "vitest";
import {
  DASHBOARD_CSRF_HOSTS,
  PUBLIC_CSRF_HOSTS,
  authOriginAllowed,
  csrfForbidden,
  csrfForbiddenPublicOrStaff,
  publicOriginAllowed,
  publicSiteOrigin,
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
    expect(publicOriginAllowed("https://vamos.koussayzayeni.workers.dev")).toBe(false);
    expect(publicOriginAllowed("https://evil.koussayzayeni.workers.dev")).toBe(false);
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
    expect(authOriginAllowed("https://evil.koussayzayeni.workers.dev")).toBe(false);
    expect(authOriginAllowed("https://vamos.koussayzayeni.workers.dev")).toBe(false);
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
    expect(trustedSiteOrigin("vamos.koussayzayeni.workers.dev")).toBeNull();
    expect(trustedSiteOrigin("evil.koussayzayeni.workers.dev")).toBeNull();
  });
});

describe("publicSiteOrigin", () => {
  it("keeps public hosts and collapses dashboard/workers.dev to vamostaxi.site", () => {
    expect(publicSiteOrigin("vamostaxi.site")).toBe("https://vamostaxi.site");
    expect(publicSiteOrigin("www.vamostaxi.site")).toBe("https://www.vamostaxi.site");
    expect(publicSiteOrigin("localhost:3000")).toBe("http://localhost:3000");
    expect(publicSiteOrigin("dashboard.vamostaxi.site")).toBe("https://vamostaxi.site");
    expect(publicSiteOrigin("vamos.koussayzayeni.workers.dev")).toBe("https://vamostaxi.site");
    expect(publicSiteOrigin("evil.example")).toBe("https://vamostaxi.site");
  });
});

describe("csrfForbiddenPublicOrStaff (quick 261003: dashboard New trip)", () => {
  const DASH = "https://dashboard.vamostaxi.site/api/checkout/intent";
  const APEX = "https://vamostaxi.site/api/checkout/intent";
  const req = (url: string, origin?: string) =>
    new Request(url, { method: "POST", headers: origin ? { Origin: origin } : {} });
  const staffYes = () => Promise.resolve(true);
  const staffNo = () => Promise.resolve(false);

  it("dashboard Origin + dashboard host + staff session → allowed", async () => {
    expect(await csrfForbiddenPublicOrStaff(req(DASH, "https://dashboard.vamostaxi.site"), staffYes)).toBeNull();
    expect(
      await csrfForbiddenPublicOrStaff(
        req("http://dashboard.localhost:8791/api/checkout/price", "http://dashboard.localhost:8791"),
        staffYes,
      ),
    ).toBeNull();
  });

  it("dashboard Origin without a staff session → 403 csrf", async () => {
    const res = await csrfForbiddenPublicOrStaff(req(DASH, "https://dashboard.vamostaxi.site"), staffNo);
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ ok: false, code: "csrf" });
  });

  it("a staff check that throws → 403", async () => {
    const res = await csrfForbiddenPublicOrStaff(req(DASH, "https://dashboard.vamostaxi.site"), () =>
      Promise.reject(new Error("auth down")),
    );
    expect(res?.status).toBe(403);
  });

  it("dashboard Origin aimed at the public host → 403, staff never asked", async () => {
    let asked = 0;
    const res = await csrfForbiddenPublicOrStaff(req(APEX, "https://dashboard.vamostaxi.site"), async () => {
      asked += 1;
      return true;
    });
    expect(res?.status).toBe(403);
    expect(asked).toBe(0);
  });

  it("foreign, look-alike, http and missing Origins → 403, staff never asked", async () => {
    let asked = 0;
    const spy = async () => {
      asked += 1;
      return true;
    };
    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "https://dashboard.vamostaxi.site.evil.example",
      "https://evil-dashboard.vamostaxi.site",
      "http://dashboard.vamostaxi.site",
      "https://dashboard.vamostaxi.eu",
    ]) {
      const res = await csrfForbiddenPublicOrStaff(req(DASH, origin), spy);
      expect(res?.status, String(origin)).toBe(403);
    }
    expect(asked).toBe(0);
  });

  it("public Origin passes as before without a staff lookup", async () => {
    let asked = 0;
    const spy = async () => {
      asked += 1;
      return false;
    };
    expect(await csrfForbiddenPublicOrStaff(req(APEX, "https://vamostaxi.site"), spy)).toBeNull();
    expect(await csrfForbiddenPublicOrStaff(req(APEX, "https://www.vamostaxi.site"), spy)).toBeNull();
    expect(asked).toBe(0);
  });

  it("PUBLIC_CSRF_HOSTS still excludes the dashboard (plain public routes keep refusing it)", () => {
    expect(PUBLIC_CSRF_HOSTS).not.toContain("dashboard.vamostaxi.site");
    expect(DASHBOARD_CSRF_HOSTS).toEqual(["dashboard.vamostaxi.site", "dashboard.localhost"]);
    const res = csrfForbidden(
      new Request("https://dashboard.vamostaxi.site/api/manage/cancel", {
        method: "POST",
        headers: { Origin: "https://dashboard.vamostaxi.site" },
      }),
    );
    expect(res?.status).toBe(403);
  });
});
