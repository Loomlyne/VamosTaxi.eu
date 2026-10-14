// Phase 32 D-06: Content › Pages and Content › Legal are gone from the dashboard. This guard
// fails if a removed screen, route, library or import returns. The public readers stay.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = process.cwd();
const repoRoot = join(webRoot, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe("removed dashboard Content screens (Phase 32 D-06)", () => {
  it("deleted files stay deleted", () => {
    const gone = [
      "app/ops/OpsContent.dc.html",
      "apps/web/app/[locale]/(ops)/api/staff/content/route.ts",
      "apps/web/app/[locale]/(ops)/api/staff/content/[key]/route.ts",
      "apps/web/app/[locale]/(ops)/api/staff/content/[key]/flags/route.ts",
      "apps/web/app/api/staff/content/route.ts",
      "apps/web/app/api/staff/content/[key]/route.ts",
      "apps/web/app/api/staff/content/[key]/flags/route.ts",
      "apps/web/app/[locale]/(ops)/ops/content/actions.ts",
      "apps/web/lib/ops/content.ts",
    ];
    for (const f of gone) expect(existsSync(join(repoRoot, f)), f).toBe(false);
  });

  it("no source file mentions the staff content API or the editor library", () => {
    const self = join(webRoot, "lib/ops/content-removed.test.ts");
    const files = [...walk(join(webRoot, "app")), ...walk(join(webRoot, "lib"))].filter((f) => f !== self);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text.includes("api/staff/content"), relative(webRoot, f)).toBe(false);
      expect(text.includes('lib/ops/content"'), relative(webRoot, f)).toBe(false);
    }
  });

  it("the dashboard shell no longer mentions OpsContent", () => {
    expect(readFileSync(join(repoRoot, "app/ops/ops.dc.html"), "utf8")).not.toMatch(/OpsContent/);
    expect(readFileSync(join(repoRoot, "app/vamos-ops-api.js"), "utf8")).not.toMatch(/OpsContent/);
  });

  it("the public content readers stay and still read public.content_strings", () => {
    const db = join(webRoot, "lib/db/content.ts");
    const messages = join(webRoot, "lib/content/messages.ts");
    expect(existsSync(db)).toBe(true);
    expect(existsSync(messages)).toBe(true);
    expect(readFileSync(messages, "utf8")).toMatch(/from public\.content_strings/);
    expect(readFileSync(db, "utf8")).toMatch(/content_strings/);
  });
});
