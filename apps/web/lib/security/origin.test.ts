import { describe, expect, it } from "vitest";
import { csrfForbidden, publicOriginAllowed } from "./origin";

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
});
