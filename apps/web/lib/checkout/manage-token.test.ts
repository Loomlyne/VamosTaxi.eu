import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MANAGE_COOKIE_NAME,
  manageTokenCookie,
  mintManageToken,
  rawManageTokenFromRequest,
  readManageCookie,
} from "./manage-token";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel: string): string {
  return readFileSync(join(repo, rel), "utf8");
}

describe("mintManageToken", () => {
  it("returns 32-byte entropy hashed to 32 bytes", async () => {
    const token = await mintManageToken();
    expect(token.hash.byteLength).toBe(32);
    expect(token.raw.length).toBeGreaterThan(40);
  });

  it("never repeats across consecutive calls", async () => {
    const a = await mintManageToken();
    const b = await mintManageToken();
    expect(a.raw).not.toBe(b.raw);
    expect(Buffer.from(a.hash).equals(Buffer.from(b.hash))).toBe(false);
  });
});

describe("manageTokenCookie", () => {
  it("is HttpOnly Secure SameSite=Lax with caller Max-Age", () => {
    const cookie = manageTokenCookie("raw-token", 1800);
    expect(cookie).toContain(`${MANAGE_COOKIE_NAME}=raw-token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=1800");
    expect(cookie).toContain("Path=/");
  });
});

describe("readManageCookie", () => {
  it("prefers the jar and falls back to the Cookie header", () => {
    expect(readManageCookie("from-jar", `${MANAGE_COOKIE_NAME}=from-header`)).toBe("from-jar");
    expect(readManageCookie("", `${MANAGE_COOKIE_NAME}=from-header; other=1`)).toBe("from-header");
    expect(readManageCookie("", "other=1")).toBe("");
    expect(readManageCookie("", null)).toBe("");
  });
});

describe("rawManageTokenFromRequest (K100)", () => {
  it("prefers the cookie over the query token", () => {
    const req = new Request("https://vamostaxi.site/api/manage/booking?token=from-query", {
      headers: { cookie: `${MANAGE_COOKIE_NAME}=from-cookie` },
    });
    expect(rawManageTokenFromRequest(req)).toBe("from-cookie");
  });

  it("falls back to query when there is no cookie", () => {
    const req = new Request("https://vamostaxi.site/api/manage/booking?token=from-query");
    expect(rawManageTokenFromRequest(req)).toBe("from-query");
  });
});

describe("manage token leaves the URL (K100)", () => {
  it("middleware 302-strips token on manage-booking and booking-detail", () => {
    const mw = read("apps/web/middleware.ts");
    expect(mw).toContain('path === "/manage-booking" || path === "/booking-detail"');
    expect(mw).toContain('url.searchParams.delete("token")');
    expect(mw).toContain("MANAGE_COOKIE_NAME");
  });

  it("GET /api/manage/booking reads cookie first", () => {
    const src = read("apps/web/app/api/manage/booking/route.ts");
    expect(src).toContain("rawManageTokenFromRequest");
    expect(src).not.toMatch(/searchParams\.get\("token"\)/);
  });

  it("guest fetch omits token= when the URL is already stripped", () => {
    const src = read("app/vamos-manage-ticket.js");
    expect(src).toContain('"/api/manage/booking"');
    expect(src).toMatch(/tok\s*\?\s*"\/api\/manage\/booking\?token="/);
    const page = read("app/pages/manage-booking.dc.html");
    expect(page).toContain("tok || !detail");
  });
});
