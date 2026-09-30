// apps/web/lib/seo/head.test.ts
//
// The head table is the one source for the served mocks and the Next sitemap. These tests
// fail when a served public page has no title or description in a language, when two
// pages share a title, when a text runs past its limit, or when the sitemap, the table and
// the middleware page list drift apart.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SITEMAP_ROUTES } from "../../app/sitemap";
import {
  SEO_LANGS,
  SEO_PAGES,
  applySeoToHtml,
  faqEntries,
  indexablePages,
  seoAddress,
  seoHeadTags,
  seoPageFor,
  seoRoute,
} from "./head";

const here = dirname(fileURLToPath(import.meta.url));
const middleware = readFileSync(join(here, "../../middleware.ts"), "utf8");

/** Keys of DC_PAGES in middleware.ts: every page the Worker serves from a mock. */
function servedPaths(): string[] {
  const block = /const DC_PAGES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(middleware)?.[1] ?? "";
  return [...block.matchAll(/^\s*"(\/[^"]*)":/gm)].map((m) => m[1] as string);
}

// Served mocks that are not a page of their own: a sign-up alias and the HTML sitemap.
const NOT_A_PAGE = new Set(["/coming-soon", "/sitemap"]);

describe("one table for every served page", () => {
  it("has a row for every served mock page", () => {
    for (const path of servedPaths()) {
      if (NOT_A_PAGE.has(path)) continue;
      expect(seoPageFor(path), `no row for ${path}`).not.toBeNull();
    }
  });

  it("gives every page a title in all four languages", () => {
    for (const page of SEO_PAGES) {
      for (const lang of SEO_LANGS) expect(page.title[lang]?.trim(), `${page.path} ${lang}`).toBeTruthy();
    }
  });

  it("gives every indexable page a description in all four languages", () => {
    for (const page of indexablePages()) {
      for (const lang of SEO_LANGS) expect(page.description?.[lang]?.trim(), `${page.path} ${lang}`).toBeTruthy();
    }
  });

  it("never lets two pages share a title or a description in one language", () => {
    for (const lang of SEO_LANGS) {
      const titles = SEO_PAGES.map((p) => p.title[lang]);
      expect(new Set(titles).size, `duplicate title in ${lang}`).toBe(titles.length);
      const descriptions = indexablePages().map((p) => p.description?.[lang]);
      expect(new Set(descriptions).size, `duplicate description in ${lang}`).toBe(descriptions.length);
    }
  });

  it("keeps titles near 60 and descriptions near 155 characters", () => {
    for (const page of SEO_PAGES) {
      for (const lang of SEO_LANGS) {
        expect(page.title[lang].length, `${page.path} ${lang} title`).toBeLessThanOrEqual(62);
        if (page.description) expect(page.description[lang].length).toBeLessThanOrEqual(160);
      }
    }
  });

  it("writes the brand in Latin letters in every language and never a claim", () => {
    for (const page of SEO_PAGES) {
      for (const lang of SEO_LANGS) {
        if (page.indexable) expect(`${page.title[lang]} ${page.description?.[lang]}`).toContain("Vamos Taxi");
        const text = `${page.title[lang]} ${page.description?.[lang] ?? ""}`;
        expect(text).not.toMatch(/\d+\s?(?:\/|x)\s?\d+|CHF\s?\d|24\/7|cheapest|best\b|★|ß/i);
      }
    }
  });
});

describe("sitemap", () => {
  it("lists exactly the indexable rows", () => {
    expect([...SITEMAP_ROUTES].sort()).toEqual(indexablePages().map((p) => p.path).sort());
  });
});

describe("head tags", () => {
  const home = seoPageFor("/")!;

  it("writes canonical, hreflang, Open Graph, Twitter, icons and theme colour", () => {
    const head = seoHeadTags(home, "de");
    expect(head).toContain('<link rel="canonical" href="https://vamostaxi.site/de">');
    for (const l of SEO_LANGS) expect(head).toContain(`hreflang="${l}" href="${seoAddress("/", l)}"`);
    expect(head).toContain('hreflang="x-default" href="https://vamostaxi.site"');
    expect(head).toContain('property="og:image" content="https://vamostaxi.site/og-image.jpg"');
    expect(head).toContain('property="og:locale" content="de_CH"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
    expect(head).toContain('rel="apple-touch-icon"');
    expect(head).toContain('name="theme-color" content="#1E1F1F"');
  });

  it("keeps private pages noindex with no share picture", () => {
    const head = seoHeadTags(seoPageFor("/sign-in")!, "en");
    expect(head).toContain('name="robots" content="noindex, nofollow"');
    expect(head).not.toContain("og:image");
    expect(head).not.toContain("canonical");
  });

  it("puts the organisation on home only, from imprint facts", () => {
    expect(seoHeadTags(home, "en")).toContain('"name":"Vamos Taxi GmbH"');
    expect(seoHeadTags(seoPageFor("/about")!, "en")).not.toContain("application/ld+json");
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(seoHeadTags(home, "en"))?.[1] ?? "";
    expect(ld).not.toMatch(/aggregateRating|review|price|openingHours/i);
  });

  it("rewrites html lang and dir and stores the language a prefixed address names", () => {
    const html = "<!doctype html><html><head><title>x</title></head><body></body></html>";
    const out = applySeoToHtml(html, home, "ar", true);
    expect(out).toContain('<html lang="ar" dir="rtl">');
    expect(out).toContain('localStorage.setItem("vamosLang","ar")');
    expect(out.indexOf("<script>")).toBeLessThan(out.indexOf("<title>Vamos Taxi"));
  });
});

describe("FAQPage", () => {
  const html = `<div data-faq-card="1" data-open="{{ o1 }}"><h3><button type="button" data-faq-toggle="1" id="q1">Do I pay a tip &amp; more?<span data-faq-circle="1"></span></button></h3>
<div data-faq-panel="1" id="a1"><div data-faq-inner="1"><p data-faq-a="1">No. It is in the price.</p><p data-faq-a="1">Nothing on top.</p></div></div></div>`;

  it("copies question and answer text as the page prints it", () => {
    expect(faqEntries(html)).toEqual([{ question: "Do I pay a tip & more?", answer: "No. It is in the price. Nothing on top." }]);
  });

  it("is English only, since the other languages are translated in the browser", () => {
    const page = seoPageFor("/faq")!;
    const page0 = `<html><head></head><body>${html}</body></html>`;
    expect(applySeoToHtml(page0, page, "en", false)).toContain('"@type":"FAQPage"');
    expect(applySeoToHtml(page0, page, "de", true)).not.toContain("FAQPage");
  });
});

describe("addresses", () => {
  it("serves a language on its own address and sends a cookie language there", () => {
    expect(seoRoute("/about", "de", "en")).toMatchObject({ kind: "serve", lang: "de", prefixed: true });
    expect(seoRoute("/about", null, "fr")).toEqual({ kind: "redirect", to: "/fr/about" });
    expect(seoRoute("/", null, "ar")).toEqual({ kind: "redirect", to: "/ar" });
    expect(seoRoute("/about", "en", "en")).toEqual({ kind: "redirect", to: "/about" });
    expect(seoRoute("/about", null, "en")).toMatchObject({ kind: "serve", lang: "en", prefixed: false });
  });

  it("keeps private pages on one address", () => {
    expect(seoRoute("/sign-in", "de", "en")).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(seoRoute("/sign-in", null, "de")).toMatchObject({ kind: "serve", lang: "de", prefixed: false });
  });
});
