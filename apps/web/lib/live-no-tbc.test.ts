// Owner decision 2026-09-30 (question form, legal follow-up): no TBC on any page a customer can
// see. The live public pages are the DC mocks (apps/web/middleware.ts DC_PAGES); the Next.js
// routes that are live render the cookie banner. Review galleries (*States.dc.html) are not
// served to customers and are skipped.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

/** A rendered pill: an element carrying data-tok (not data-tok-fig) with text or a template value inside. */
const PILL = /<[a-z]+\b[^>]*\sdata-tok(?:="1")?[\s>][^<]*[^\s<][^<]*</gi;

function mockFiles(): string[] {
  return ["app/pages", "app/home"].flatMap((dir) =>
    readdirSync(join(repoRoot, dir))
      .filter((f) => f.endsWith(".dc.html") && !f.endsWith("States.dc.html"))
      .map((f) => `${dir}/${f}`),
  );
}

describe("no TBC on live pages", () => {
  it("no live mock renders a TBC pill", () => {
    const found = mockFiles().flatMap((rel) => {
      const src = readFileSync(join(repoRoot, rel), "utf8").replace(/<style[\s\S]*?<\/style>/gi, "");
      return [...src.matchAll(PILL)].map((m) => `${rel}: ${m[0].slice(0, 120)}`);
    });
    expect(found).toEqual([]);
  });

  it("the cookie banner hides its Meta slot while it only holds a gap", () => {
    const css = readFileSync(join(here, "../components/consent/CookieBanner.css"), "utf8");
    expect(css).toMatch(/\.vt-ck-meta:has\(\[data-tok\]\)\s*\{\s*display:\s*none;/);
  });

  it("the pill pattern finds the old gaps", () => {
    const old = '<span data-vt-no-i18n="1" data-tok="1" title="Awaiting a confirmed value from Vamos Taxi">City stay fee</span>';
    expect(old.match(PILL)).toHaveLength(1);
    expect('<span data-tok data-vt-no-i18n="1">Free cancellation window</span>'.match(PILL)).toHaveLength(1);
    expect('<span data-tok-fig="1">100% refunded</span>'.match(PILL)).toBeNull();
  });
});
