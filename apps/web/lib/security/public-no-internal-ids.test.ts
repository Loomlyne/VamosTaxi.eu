// Nothing a visitor can fetch names our Supabase project, and /cookies shows the Meta row
// as one readable line at every width (owner, 2026-10-04: "hide all ids").
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");
// Built from parts so this file does not itself carry the ref.
const PROJECT_REF = ["yaumjzvyl", "ngfjhtuffqs"].join("");

function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(html|js|json|css|md|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("no internal ids on public surfaces", () => {
  it("the DC mock sources never name the Supabase project", () => {
    const hits = files(join(repoRoot, "app")).filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF));
    expect(hits).toEqual([]);
  });

  it("the React cookies twin shows the auth cookie without the project ref", () => {
    const twin = readFileSync(join(webRoot, "app/[locale]/cookies/page.tsx"), "utf8");
    expect(twin).not.toContain(PROJECT_REF);
    expect(twin).toContain("sb-…-auth-token");
  });

  it("the served copy (after sync) has no project ref, no HTML comments, no design-system tooling", () => {
    const pub = join(webRoot, "public");
    if (!existsSync(join(pub, "app"))) return; // sync runs before `pnpm test`; nothing served yet
    const served = [...files(join(pub, "app")), ...files(join(pub, "_ds"))];
    expect(served.filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF))).toEqual([]);
    const pages = served.filter((f) => f.endsWith(".html") && !f.includes(`${join("app", "ops")}`));
    expect(pages.filter((f) => readFileSync(f, "utf8").includes("<!--"))).toEqual([]);
    expect(served.filter((f) => /(readme\.md|_ds_manifest\.json|_adherence\.oxlintrc\.json)$/.test(f))).toEqual([]);
  });
});

describe("/cookies Meta row renders as one line", () => {
  const cookies = readFileSync(join(repoRoot, "app/pages/cookies.dc.html"), "utf8");

  it("the narrow card layout does not split the owner text into grid cells", () => {
    expect(cookies).toContain("[data-ct] tbody tr[data-cookies-row] td{display:block;");
    expect(cookies).toContain("[data-ct] tbody tr[data-cookies-row] td::before{display:none}");
    expect(cookies).toContain("[data-ct] tbody tr[data-cookies-row] td{display:table-cell;");
  });

  it("the Marketing table has no column headers over its single sentence", () => {
    const sec = cookies.match(/<section id="marketing">[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(sec).toContain("<caption>Marketing</caption>");
    expect(sec).not.toContain("<thead>");
  });

  it("the auth cookie reads sb-…-auth-token", () => {
    expect(cookies).toContain('<span class="vt-dir-keep">sb-…-auth-token</span>');
  });
});
