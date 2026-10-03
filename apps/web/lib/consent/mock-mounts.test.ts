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
  // The function ends at the next top-level declaration (main added plain functions after it).
  const rest = middleware.slice(start + 10);
  const next = rest.search(/\n(?:async )?function /);
  const end = next === -1 ? middleware.length : start + 10 + next;
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

describe("pixel loader mounts (META-07, Phase 28)", () => {
  const LOADER_LINE = '<script src="../vamos-meta.js"></script>';
  const CONSENT_LINE = '<script src="../vamos-consent.js"></script>';
  const twins = ["app/pages/CookieBanner.dc.html", "app/home/CookieBanner.dc.html"];

  for (const file of twins) {
    it(`${file} loads the loader exactly once, right after the consent runtime`, () => {
      const text = read(file);
      expect(text.split(LOADER_LINE).length - 1).toBe(1);
      expect(text.indexOf(LOADER_LINE)).toBeGreaterThan(text.indexOf(CONSENT_LINE));
    });
  }

  it("no ops page and no other mock references the loader", () => {
    const offenders: string[] = [];
    for (const dir of ["app/ops", "app/pages", "app/home"]) {
      for (const f of readdirSync(join(repoRoot, dir)).filter((n) => n.endsWith(".html"))) {
        const rel = `${dir}/${f}`;
        if (twins.includes(rel)) continue;
        if (read(rel).includes("vamos-meta.js")) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no Next page or component references the loader (no Next page loads the pixel)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "node_modules" && e.name !== ".next") walk(rel);
        } else if (/\.(ts|tsx|js|jsx|html)$/.test(e.name) && read(rel).includes("vamos-meta.js")) {
          hits.push(rel);
        }
      }
    };
    walk("apps/web/app");
    walk("apps/web/components");
    expect(hits).toEqual([]);
  });

  it("serveDcHtml puts no loader and no Meta call in server HTML (D-05)", () => {
    const start = middleware.indexOf("async function serveDcHtml");
    const rest = middleware.slice(start + 10);
    const next = rest.search(/\n(?:async )?function /);
    const body = middleware.slice(start, next === -1 ? middleware.length : start + 10 + next);
    expect(body).not.toContain("vamos-meta");
    expect(body).not.toContain("fb" + "q");
    expect(body).not.toContain("pixel");
  });
});
