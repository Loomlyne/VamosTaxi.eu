import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    // `.next-*` are per-spec Next build folders (gitignored) that Playwright runs leave behind.
    if (SKIP.has(e) || e.startsWith(".next-")) continue;
    const full = join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|jsx)$/.test(e)) out.push(full);
  }
  return out;
}

const all = walk(root).map((f) => ({ rel: relative(root, f), src: readFileSync(f, "utf8") }));
const isTest = (rel: string) => /\.test\.|(^|\/)tests\//.test(rel);
const isClient = (src: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

const IMPORTERS = new Set([
  "lib/supabase/service.ts",
  "app/[locale]/(ops)/api/staff/invite/route.ts",
  "lib/checkout/provision-account.ts",
  "lib/checkout/account-notice.ts",
]);
const SERVER_ONLY_MODULES = /["'](?:@\/|\.{1,2}\/)[^"']*(?:supabase\/service-role|supabase\/service|account-notice|provision-account)["']/;

describe("D-14 service-role laws", () => {
  it("only lib/supabase/service-role.ts names SUPABASE_SERVICE_ROLE_KEY", () => {
    const hits = all
      .filter((f) => !isTest(f.rel) && f.rel !== "lib/env.d.ts" && f.src.includes("SUPABASE_SERVICE_ROLE_KEY"))
      .map((f) => f.rel);
    expect(hits).toEqual(["lib/supabase/service-role.ts"]);
  });

  it("service-role is imported only by the allowlist, none of them client files", () => {
    const importers = all
      .filter((f) => !isTest(f.rel) && /["'][^"']*\/service-role["']/.test(f.src) && f.rel !== "lib/supabase/service-role.ts")
      .map((f) => f.rel);
    for (const rel of importers) {
      expect(IMPORTERS.has(rel), rel).toBe(true);
      expect(isClient(all.find((f) => f.rel === rel)!.src), rel).toBe(false);
    }
    expect(importers).toContain("lib/supabase/service.ts");
    expect(importers).toContain("app/[locale]/(ops)/api/staff/invite/route.ts");
    for (const rel of IMPORTERS) if (existsSync(join(root, rel))) expect(isClient(readFileSync(join(root, rel), "utf8"))).toBe(false);
  });

  it("no client component imports the server-only modules", () => {
    const bad = all.filter((f) => !isTest(f.rel) && isClient(f.src) && SERVER_ONLY_MODULES.test(f.src)).map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it("no NEXT_PUBLIC name contains SERVICE_ROLE", () => {
    const bad = all.filter((f) => /NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/.test(f.src) && f.rel !== "lib/supabase/service-role-laws.test.ts").map((f) => f.rel);
    expect(bad).toEqual([]);
  });
});
