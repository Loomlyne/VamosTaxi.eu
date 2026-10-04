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

/** A developer block comment in JS/CSS (licence notices `/*!` aside), strings blanked first. */
function hasBlockComment(text: string): boolean {
  return /(^|[\s;{}(,])\/\*(?!!)/.test(text.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""'));
}

describe("no internal ids on public surfaces", () => {
  it("the DC mock sources never name the Supabase project", () => {
    const hits = files(join(repoRoot, "app")).filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF));
    expect(hits).toEqual([]);
  });

  it("the React cookies twin shows the auth cookie without the project ref", () => {
    const twin = readFileSync(join(webRoot, "app/[locale]/cookies/page.tsx"), "utf8");
    expect(twin).not.toContain(PROJECT_REF);
    expect(twin).toContain('tech="vt-auth"');
    expect(twin).not.toContain("auth-token");
  });

  // `pnpm test` syncs first. Without a synced copy the case shows as skipped locally and fails in CI.
  const pub = join(webRoot, "public");
  const synced = existsSync(join(pub, "app"));
  it.skipIf(!synced && !process.env.CI)("the served copy (after sync) has no project ref, no HTML comments, no design-system tooling", () => {
    expect(synced, "run node scripts/sync-dc-mock-to-public.mjs first").toBe(true);
    const served = [...files(join(pub, "app")), ...files(join(pub, "_ds"))];
    expect(served.filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF))).toEqual([]);
    const pages = served.filter((f) => f.endsWith(".html") && !f.includes(`${join("app", "ops")}`));
    expect(pages.filter((f) => readFileSync(f, "utf8").includes("<!--"))).toEqual([]);
    expect(served.filter((f) => /(readme\.md|_ds_manifest\.json|_adherence\.oxlintrc\.json)$/.test(f))).toEqual([]);
    // Served scripts, styles and the bundle carry no developer comment (licence notices aside).
    const code = served.filter((f) => /\.(js|css)$/.test(f) && !f.includes(`${join("app", "ops")}`));
    const commented = code.filter((f) => hasBlockComment(readFileSync(f, "utf8")));
    expect(commented).toEqual([]);
  });

  // public/brand is committed and served as it is (no sync strip), so its token CSS was stripped
  // by hand (8cf45166). Review of 2dcf9d88: a comment put back there must fail here.
  it("public/brand (served as committed) has no developer comment and no project ref", () => {
    const brandDir = join(pub, "brand");
    const brand = files(brandDir);
    const css = brand.filter((f) => f.endsWith(".css"));
    expect(css.length).toBeGreaterThan(0);
    expect(css.filter((f) => hasBlockComment(readFileSync(f, "utf8")))).toEqual([]);
    expect(brand.filter((f) => readFileSync(f, "utf8").includes(PROJECT_REF))).toEqual([]);
    const svg: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".svg")) svg.push(p);
      }
    };
    walk(brandDir);
    expect(svg.filter((f) => readFileSync(f, "utf8").includes("<!--"))).toEqual([]);
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

  it("the auth cookie reads vt-auth", () => {
    expect(cookies).toContain('<span data-ck-tech="1" class="vt-dir-keep" data-vt-no-i18n="1">vt-auth</span>');
    expect(cookies).not.toContain("auth-token");
  });

  it("every cookie row leads with its plain name; the technical name sits underneath, left to right, untranslated", () => {
    const names: [string, string][] = [
      ["Sign-in", "vt-auth"],
      ["Your cookie choice", "consent_subject · vamosCookieConsent"],
      ["Stripe payment", "__stripe_mid · __stripe_sid"],
      ["Cloudflare check", "cf_clearance"],
      ["Fair pricing", "vamos_qs"],
      ["Booking access", "vt_manage"],
      ["Language", "NEXT_LOCALE"],
      ["Language (this browser)", "vamosLang"],
      ["Recent addresses", "vamos:recent-places"],
    ];
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    for (const [plain, tech] of names) {
      expect(cookies).toContain(
        `<td data-l="Name"><span data-ck-name="1"><span data-ck-plain="1">${plain}</span><span data-ck-tech="1" class="vt-dir-keep" data-vt-no-i18n="1">${tech}</span></span></td>`,
      );
      expect(dict, plain).toContain(`'${plain}': { de: '`);
    }
    // The Meta row keeps the owner's verbatim text, no plain-name cell.
    const meta = cookies.match(/<tr data-cookies-row="1">[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(meta).not.toContain("data-ck-name");
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

describe("no internal phrases in strings the browser receives (reviewer F2, 2026-10-04)", () => {
  const files = [
    "apps/web/i18n/messages/en.json",
    "apps/web/i18n/messages/de.json",
    "apps/web/i18n/messages/fr.json",
    "apps/web/i18n/messages/ar.json",
    "app/vamos-i18n-dict.js",
  ];
  it.each(files)("%s names no Sentry, Supabase Auth, test mode or mail switch", (rel) => {
    const s = readFileSync(join(repoRoot, rel), "utf8");
    for (const b of ["Sentry", "Supabase Auth", "not in use until", "transactional mail is on"]) expect(s, b).not.toContain(b);
  });

  it("the React cookie banner uses the approved wording (COPY-DRAFT §3)", () => {
    const en = JSON.parse(readFileSync(join(repoRoot, "apps/web/i18n/messages/en.json"), "utf8")) as {
      cookies: Record<string, string>;
    };
    expect(en.cookies["sheet-necessary-duration"]).toBe("Up to 400 days");
    expect(en.cookies["sheet-analytics-providers"]).toBe("Cloudflare Web Analytics (cookieless)");
    expect(en.cookies["sheet-not-used"]).toBe("No cookie");
    expect(en.cookies["tells-us-which-step-of-a-booking-people-abandon"]).toBe("Tells us which step of a booking people abandon.");
  });
});

