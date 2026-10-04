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

describe("legal pages say nothing about test mode or unused vendors (COPY-DRAFT 2026-10-04)", () => {
  const pages = ["app/pages/cookies.dc.html", "app/pages/privacy.dc.html", "app/pages/CookieBanner.dc.html", "app/home/CookieBanner.dc.html"];
  const banned = ["not in use until live payments", "Sentry", "as set by Cloudflare", "as issued by Supabase Auth", "The platform we are building", "transactional mail is on", ">none<", ">not used<"];

  it.each(pages)("%s carries none of the internal phrases", (rel) => {
    const html = readFileSync(join(repoRoot, rel), "utf8");
    for (const b of banned) expect(html, b).not.toContain(b);
  });

  it("every new visible string has de, fr and ar", () => {
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    for (const k of [
      "Up to 400 days, or until you sign out", "Up to 400 days", "1 year · 30 minutes", "30 minutes",
      "No cookie", "Nothing is stored in your browser", "Tells us which step of a booking people abandon.",
      "Our suppliers", "Confirmation and driver-detail emails",
    ]) expect(dict, k).toMatch(new RegExp(`'${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}': \\{ de: '[^']+', fr: '[^']+', ar: '[^']+' \\}`));
  });
});

