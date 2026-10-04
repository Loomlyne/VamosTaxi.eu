import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { REVIEW_COOKIE_MAX_AGE, REVIEW_COOKIE_NAME, reviewTokenFor, reviewTokenRedirect } from "./review-cookie";

const web = join(dirname(fileURLToPath(import.meta.url)), "../..");
const req = (url: string, method = "GET") => new NextRequest(new URL(url), { method });

describe("review link token leaves the URL (owner 2026-10-04)", () => {
  it("302s /review?token=… to /review and keeps the token in an HttpOnly cookie on /review", () => {
    const res = reviewTokenRedirect(req("https://vamostaxi.site/review?token=abc123&bookingRef=VT-1"), "/review");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(302);
    const loc = new URL(res!.headers.get("location")!);
    expect(loc.pathname).toBe("/review");
    expect(loc.searchParams.has("token")).toBe(false);
    expect(loc.searchParams.get("bookingRef")).toBe("VT-1");
    const sc = res!.headers.get("set-cookie") ?? "";
    expect(sc).toContain(`${REVIEW_COOKIE_NAME}=abc123`);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=lax/i);
    expect(sc).toContain("Path=/review");
    expect(sc).toContain(`Max-Age=${REVIEW_COOKIE_MAX_AGE}`);
  });

  it("leaves every other request alone", () => {
    expect(reviewTokenRedirect(req("https://vamostaxi.site/review"), "/review")).toBeNull();
    expect(reviewTokenRedirect(req("https://vamostaxi.site/review?token="), "/review")).toBeNull();
    expect(reviewTokenRedirect(req("https://vamostaxi.site/contact?token=x"), "/contact")).toBeNull();
    expect(reviewTokenRedirect(req("https://vamostaxi.site/review?token=x", "POST"), "/review")).toBeNull();
  });

  it("the page reads the query first, then the cookie", () => {
    expect(reviewTokenFor(" q ", "c")).toBe("q");
    expect(reviewTokenFor(undefined, " c ")).toBe("c");
    expect(reviewTokenFor(["x"], undefined)).toBe("");
  });

  it("middleware runs the redirect on the public host and the page reads the cookie; no replaceState", () => {
    const mw = readFileSync(join(web, "middleware.ts"), "utf8");
    expect(mw).toContain("reviewTokenRedirect(request, localeStrippedPath(pathname).path)");
    const page = readFileSync(join(web, "app/[locale]/review/page.tsx"), "utf8");
    expect(page).toContain("reviewTokenFor(query.token, (await cookies()).get(REVIEW_COOKIE_NAME)?.value)");
    const form = readFileSync(join(web, "app/[locale]/review/ReviewForm.tsx"), "utf8");
    expect(form).not.toContain("replaceState");
  });
});
