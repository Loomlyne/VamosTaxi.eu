// Phase 26.5 D-17: the owner-approved "Your account" privacy paragraph is word for word
// on both surfaces (live DC mock and Next.js page) and in the seed, in en, de, fr and ar.
// The four texts are read from the decision file; no copy of them lives here.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const LOCALES = ["en", "de", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];
const LEAD: Record<Locale, string> = { en: "Your account.", de: "Ihr Konto.", fr: "Votre compte.", ar: "حسابك." };

function approved(): Record<Locale, string> {
  const doc = read(".planning/decisions/2026-09-30-legal-pages.md");
  const section = doc.split('## Privacy paragraph "Your account"')[1] ?? "";
  const out: Partial<Record<Locale, string>> = {};
  for (const m of section.matchAll(/^\| (en|de|fr|ar) \| (.+) \|$/gm)) {
    out[m[1] as Locale] = (m[2] ?? "").replace(/\*\*/g, "");
  }
  return out as Record<Locale, string>;
}

const TEXT = approved();
const bodyOf = (l: Locale) => TEXT[l].slice(LEAD[l].length + 1);

function mockText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;|&amp;/g, " ");
}

describe("privacy 'Your account' paragraph (D-17)", () => {
  it("reads all four approved texts from the decision file", () => {
    expect(Object.keys(TEXT).sort()).toEqual(["ar", "de", "en", "fr"]);
    for (const l of LOCALES) expect(TEXT[l].startsWith(`${LEAD[l]} `)).toBe(true);
  });

  for (const l of LOCALES) {
    it(`${l}: messages equal the decision text`, () => {
      const legal = (JSON.parse(read(`apps/web/i18n/messages/${l}.json`)) as Record<string, Record<string, string>>)["legal"];
      expect(`${legal?.["your-account-lead"]} ${legal?.["your-account-body"]}`).toBe(TEXT[l]);
    });

    it(`${l}: seed carries the body`, () => {
      const seed = read("packages/db/supabase/seed.sql");
      // The generator writes $vt$ dollar-quoted literals, so apostrophes are not doubled.
      expect(seed).toContain(bodyOf(l));
    });
  }

  it("de, fr, ar: dictionary equals the decision text", () => {
    const sandbox: { window: Record<string, unknown>; document: object } = { window: {}, document: {} };
    vm.runInNewContext(read("app/vamos-i18n-dict.js"), sandbox);
    const strings = (sandbox.window.VamosI18n as { strings: Record<string, Record<string, string>> }).strings;
    for (const l of ["de", "fr", "ar"] as const) {
      expect(`${strings[LEAD.en]?.[l]} ${strings[bodyOf("en")]?.[l]}`).toBe(TEXT[l]);
    }
  });

  it("DC mock: English text sits between 'When you book' and 'When you pay', no gap pill", () => {
    const html = read("app/pages/privacy.dc.html");
    const text = mockText(html).split("\n").map((s) => s.trim()).filter(Boolean).join(" ");
    expect(text).toContain(TEXT.en);
    expect(text.indexOf("When you book")).toBeLessThan(text.indexOf(TEXT.en));
    expect(text.indexOf(TEXT.en)).toBeLessThan(text.indexOf("When you pay"));
    expect(html).not.toMatch(/data-tok[^>]*>\s*Your account paragraph/);
  });

  it("Next.js page renders the two message keys and no gap", () => {
    const src = read("apps/web/app/[locale]/privacy/page.tsx");
    expect(src).toContain('t("your-account-lead")');
    expect(src).toContain('t("your-account-body")');
    expect(src).not.toContain('PendingSlot label="Your account paragraph"');
  });

  it("manage-booking mock is untouched relative to origin/main", () => {
    let diff = "skip";
    try {
      diff = execFileSync("git", ["diff", "origin/main", "--", "app/pages/manage-booking.dc.html"], { cwd: repoRoot, encoding: "utf8" });
    } catch {
      console.warn("git unavailable, manage-booking guard skipped");
      return;
    }
    expect(diff).toBe("");
  });
});
