import { describe, expect, it } from "vitest";
import { MANAGE_COOKIE_NAME, manageTokenCookie, mintManageToken, readManageCookie } from "./manage-token";

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
