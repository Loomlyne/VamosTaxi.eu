// apps/web/lib/seo/head.ts
//
// One table (pages.json), two readers: the served DC mocks (middleware injects the
// result into the first HTML) and the Next.js metadata/sitemap. A search engine and a
// link preview read the first HTML, so nothing here runs in the browser.
//
// Address rule (owner, 2026-09-30, option B): English lives at the unprefixed address,
// German, French and Arabic at /de, /fr, /ar on the nine indexable pages only. Private
// pages keep one address and their language comes from the NEXT_LOCALE cookie.

import table from "./pages.json";

export type SeoLang = "en" | "de" | "fr" | "ar";
export const SEO_LANGS: readonly SeoLang[] = ["en", "de", "fr", "ar"];

type Localised = Record<SeoLang, string>;

export interface SeoPage {
  key: string;
  path: string;
  indexable: boolean;
  title: Localised;
  description?: Localised;
  shareImage?: string;
}

export const SEO_SITE_URL: string = table.siteUrl;
export const SEO_PAGES = table.pages as readonly SeoPage[];

const BY_PATH = new Map<string, SeoPage>(SEO_PAGES.map((page) => [page.path, page]));

export function seoPageFor(path: string): SeoPage | null {
  return BY_PATH.get(path) ?? null;
}

/** The nine pages a search engine may list, in table order. */
export function indexablePages(): SeoPage[] {
  return SEO_PAGES.filter((page) => page.indexable);
}

export function isSeoLang(value: string | null | undefined): value is SeoLang {
  return value === "en" || value === "de" || value === "fr" || value === "ar";
}

/** Public address of one page in one language; English is unprefixed, no trailing slash. */
export function seoAddress(path: string, lang: SeoLang): string {
  const tail = path === "/" ? "" : path;
  if (lang === "en") return `${SEO_SITE_URL}${tail}` || `${SEO_SITE_URL}/`;
  return `${SEO_SITE_URL}/${lang}${tail}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsonLd(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

const ICON_LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48">',
  '<link rel="icon" href="/icon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
  `<meta name="theme-color" content="${table.themeColor}">`,
].join("");

/** Icons, manifest and theme colour only: for the dashboard host and any page with no row. */
export function iconHeadTags(): string {
  return ICON_LINKS;
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function plain(fragment: string): string {
  return decode(fragment.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Questions and answers exactly as the /faq mock prints them: every button with
 * data-faq-toggle and the data-faq-a paragraphs of its own panel. JSON-LD must match
 * the visible text, so this reads the page instead of keeping a second copy.
 */
export function faqEntries(html: string): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  const cards = html.split(/<div data-faq-card="1"/).slice(1);
  for (const card of cards) {
    const q = card.match(/<button[^>]*data-faq-toggle[^>]*>([\s\S]*?)<span data-faq-circle/);
    const panel = card.match(/<div data-faq-panel="1"[^>]*>([\s\S]*)/);
    if (!q || !panel) continue;
    const answers = [...(panel[1] ?? "").matchAll(/<p data-faq-a="1">([\s\S]*?)<\/p>/g)]
      .map((m) => plain(m[1] ?? ""))
      .filter(Boolean);
    const question = plain(q[1] ?? "");
    if (question && answers.length > 0) out.push({ question, answer: answers.join(" ") });
  }
  return out;
}

/** Everything that goes into <head> for one page in one language. */
export function seoHeadTags(
  page: SeoPage,
  lang: SeoLang,
  opts: { faq?: { question: string; answer: string }[] } = {},
): string {
  const tags: string[] = [`<title>${esc(page.title[lang])}</title>`, ICON_LINKS];
  if (!page.indexable || !page.description) {
    tags.push('<meta name="robots" content="noindex, nofollow">');
    return tags.join("");
  }
  const description = page.description[lang];
  const url = seoAddress(page.path, lang);
  const image = `${SEO_SITE_URL}${page.shareImage ?? "/og-image.jpg"}`;
  tags.push(`<meta name="description" content="${esc(description)}">`);
  tags.push(`<link rel="canonical" href="${url}">`);
  for (const l of SEO_LANGS) {
    tags.push(`<link rel="alternate" hreflang="${l}" href="${seoAddress(page.path, l)}">`);
  }
  tags.push(`<link rel="alternate" hreflang="x-default" href="${seoAddress(page.path, "en")}">`);
  tags.push(
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(table.siteName)}">`,
    `<meta property="og:title" content="${esc(page.title[lang])}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:locale" content="${table.locales[lang]}">`,
  );
  for (const l of SEO_LANGS) {
    if (l !== lang) tags.push(`<meta property="og:locale:alternate" content="${table.locales[l]}">`);
  }
  tags.push(
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(page.title[lang])}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${image}">`,
  );
  if (page.path === "/") {
    const org = table.organization;
    tags.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: org.name,
        url: SEO_SITE_URL,
        logo: `${SEO_SITE_URL}${org.logo}`,
        email: org.email,
        telephone: org.telephone,
        address: {
          "@type": "PostalAddress",
          streetAddress: org.streetAddress,
          postalCode: org.postalCode,
          addressLocality: org.addressLocality,
          addressCountry: org.addressCountry,
        },
      }),
    );
  }
  if (opts.faq && opts.faq.length > 0) {
    tags.push(
      jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: opts.faq.map((entry) => ({
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
        })),
      }),
    );
  }
  return tags.join("");
}

/**
 * Put the head into the mock HTML the server sends: html lang and dir, then the tags
 * straight after <head>. The first script hands the page its titles, so a language switch
 * in the browser can retitle the tab; on a prefixed address it also stores the language the
 * address names, so the mock paints in it on first frame. English FAQ JSON-LD only: the
 * German, French and Arabic answers are translated in the browser, so their text is not
 * in the first HTML.
 */
export function applySeoToHtml(html: string, page: SeoPage, lang: SeoLang, prefixed: boolean): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  let out = /<html\b[^>]*>/i.test(html)
    ? html.replace(/<html\b[^>]*>/i, `<html lang="${lang}" dir="${dir}">`)
    : html;
  const faq = page.path === "/faq" && lang === "en" ? faqEntries(html) : undefined;
  const titles = JSON.stringify(page.title).replace(/</g, "\\u003c");
  const boot =
    `<script>window.VamosSeoTitle=${titles};` +
    (prefixed ? `try{localStorage.setItem("vamosLang","${lang}")}catch(e){}` : "") +
    "</script>";
  out = out.replace(/<head\b[^>]*>/i, (open) => `${open}${boot}${seoHeadTags(page, lang, { faq })}`);
  return out;
}

export type SeoRoute =
  | { kind: "serve"; page: SeoPage; lang: SeoLang; prefixed: boolean }
  | { kind: "redirect"; to: string };

/**
 * Decide what an address means for a mock page that has a table row.
 * - `/de/about` serves German, `/en/about` is English at the unprefixed address.
 * - An unprefixed indexable page sent with a German/French/Arabic cookie goes to its
 *   prefixed address (302: a preference, not a fact about the page).
 * - A prefix on a private page or on anything outside the table is not an address.
 */
export function seoRoute(
  path: string,
  prefix: SeoLang | null,
  cookieLang: SeoLang,
): SeoRoute | null {
  const page = seoPageFor(path);
  if (!page) return null;
  if (!page.indexable) {
    return prefix ? { kind: "redirect", to: path } : { kind: "serve", page, lang: cookieLang, prefixed: false };
  }
  if (prefix === "en") return { kind: "redirect", to: path };
  if (prefix) return { kind: "serve", page, lang: prefix, prefixed: true };
  if (cookieLang !== "en") {
    return { kind: "redirect", to: `/${cookieLang}${path === "/" ? "" : path}` };
  }
  return { kind: "serve", page, lang: "en", prefixed: false };
}
