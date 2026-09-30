// F12: the confirm screen is a public DC page on both hosts, private and never indexed.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DC_MOCK_CANONICAL } from "@/lib/dc-mock-urls";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (rel: string) => readFileSync(join(repo, rel), "utf8");
const middleware = read("apps/web/middleware.ts");

describe("confirm page routing", () => {
  it("DC_PAGES serves /sign-in/confirm from sign-in-confirm", () => {
    const block = /const DC_PAGES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(middleware)![1]!;
    expect(block).toContain('"/sign-in/confirm": "/app/pages/sign-in-confirm.html"');
  });

  it("the canonical table knows the mock", () => {
    expect(DC_MOCK_CANONICAL["/app/pages/sign-in-confirm"]).toBe("/sign-in/confirm");
  });

  it("the dashboard host serves the same page at /login/confirm", () => {
    expect(middleware).toContain('"/login/confirm"');
    expect(middleware).toContain("sign-in-confirm.html");
  });

  it("the page is noindex through /sign-in and sends no token to a third party", () => {
    const page = read("app/pages/sign-in-confirm.dc.html");
    expect(middleware).toContain('"/sign-in"');
    expect(page).toContain('name="referrer" content="no-referrer"');
    expect(read("app/pages/ConfirmCard.dc.html")).toContain("history.replaceState");
    expect(page).toContain('name="robots" content="noindex');
  });

  it("the page mounts the cookie banner once and uses the shared header and footer", () => {
    const page = read("app/pages/sign-in-confirm.dc.html");
    expect(page.match(/dc-import name="CookieBanner"/g)?.length).toBe(1);
    expect(page).toContain('dc-import name="SiteHeader" variant="inverse"');
    expect(page).toContain('dc-import name="SiteFooter"');
  });

  it("the page sets the no-glow laws", () => {
    const page = read("app/pages/sign-in-confirm.dc.html");
    expect(page).toContain("--vt-shadow-accent:none");
    expect(page).toContain(".vt-input--focus{box-shadow:none}");
  });
});
