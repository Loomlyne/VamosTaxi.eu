// D-07 / D-32: every customer DC mock mounts the cookie banner, no ops page does.
// D-23: serveDcHtml injects only the public Turnstile site key, nothing per visitor.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const MOUNT = /dc-import name="CookieBanner"/g;
const middleware = read("apps/web/middleware.ts");

/** Mock source files behind DC_PAGES, derived from middleware.ts. */
function customerMocks(): string[] {
  const block = /const DC_PAGES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(middleware);
  if (!block) throw new Error("DC_PAGES not found in middleware.ts");
  const files = new Set<string>();
  for (const m of block[1]!.matchAll(/"(\/app\/[^"]+)\.html"/g)) {
    files.add(`${m[1]!.slice(1)}.dc.html`);
  }
  files.add("app/home/home.dc.html");
  return [...files].sort();
}

describe("cookie banner mounts (D-07, D-32)", () => {
  const mocks = customerMocks();

  it("derives the expected customer page list", () => {
    expect(mocks.length).toBeGreaterThanOrEqual(17);
    expect(mocks).toContain("app/pages/sign-in.dc.html");
    expect(mocks).toContain("app/pages/coming-soon.dc.html");
  });

  for (const file of customerMocks()) {
    it(`${file} mounts CookieBanner exactly once`, () => {
      expect(read(file).match(MOUNT)?.length ?? 0).toBe(1);
    });
  }

  it("no ops page mounts CookieBanner", () => {
    const offenders = readdirSync(join(repoRoot, "app/ops"))
      .filter((f) => f.endsWith(".html"))
      .filter((f) => read(`app/ops/${f}`).includes('name="CookieBanner"'));
    expect(offenders).toEqual([]);
  });
});

describe("serveDcHtml carries no per-visitor state (D-23, T-27-16)", () => {
  const start = middleware.indexOf("async function serveDcHtml");
  const end = middleware.indexOf("async function", start + 10);
  const body = middleware.slice(start, end);

  it("injects the public Turnstile site key", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("vt-turnstile-site-key");
    expect(body).not.toContain("mock === DC_PAGES");
  });

  it("reads no cookie, consent or identity", () => {
    for (const banned of ["cookie", "consent_subject", "readConsentSubject", "x-consent", "asAnon"]) {
      expect(body.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it("keeps the marketing cache line unchanged", () => {
    expect(middleware).toContain('"public, s-maxage=300, stale-while-revalidate=3600"');
  });
});
