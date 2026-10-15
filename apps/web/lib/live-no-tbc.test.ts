// Owner decision 2026-09-30 (question form, legal follow-up): no TBC on any page a customer can
// see. The live public pages are the DC mocks (apps/web/middleware.ts DC_PAGES); the Next.js
// routes that are live render the cookie banner. Review galleries (*States.dc.html) are not
// served to customers and are skipped. So are the pages the sync script never publishes (SKIP_PUBLIC in
// scripts/sync-dc-mock-to-public.mjs): checkout.dc.html is the design-parity twin of the Next /checkout and
// carries the signed hold-hours pill (quick 261015-6om, owner 2026-10-15); a customer never loads it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

/** A rendered pill: an element carrying data-tok (not data-tok-fig) with text or a template value inside. */
const PILL = /<[a-z]+\b[^>]*\sdata-tok(?:="1")?[\s>][^<]*[^\s<][^<]*</gi;

/** app/pages mocks the sync script deletes from the served copy (its SKIP_PUBLIC set). */
function notServed(): Set<string> {
  const src = readFileSync(join(repoRoot, "scripts/sync-dc-mock-to-public.mjs"), "utf8");
  const block = /const SKIP_PUBLIC = new Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? "";
  return new Set([...block.matchAll(/"([^"]+\.dc\.html)"/g)].map((m) => `app/pages/${m[1]}`));
}

function mockFiles(): string[] {
  const skip = notServed();
  return ["app/pages", "app/home"].flatMap((dir) =>
    readdirSync(join(repoRoot, dir))
      .filter((f) => f.endsWith(".dc.html") && !f.endsWith("States.dc.html"))
      .map((f) => `${dir}/${f}`)
      .filter((rel) => !skip.has(rel)),
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

  it("only checkout, confirmation and become-a-partner are left out, and none of them is a public DC route", () => {
    expect([...notServed()].sort()).toEqual([
      "app/pages/become-a-partner.dc.html",
      "app/pages/checkout.dc.html",
      "app/pages/confirmation.dc.html",
    ]);
    const middleware = readFileSync(join(here, "../middleware.ts"), "utf8");
    const routes = middleware.slice(middleware.indexOf("const DC_PAGES"), middleware.indexOf("};", middleware.indexOf("const DC_PAGES")));
    expect(routes).toContain('"/app/pages/about.html"');
    for (const rel of notServed()) {
      const base = rel.split("/").pop()!.replace(/\.dc\.html$/, "");
      expect(routes).not.toContain(`/app/pages/${base}.html`);
      expect(routes).not.toContain(`/app/pages/${base}.dc.html`);
    }
  });

  it("the cookie banner has no .vt-ck-meta and no PendingSlot", () => {
    const css = readFileSync(join(here, "../components/consent/CookieBanner.css"), "utf8");
    const tsx = readFileSync(join(here, "../components/consent/CookieBanner.tsx"), "utf8");
    expect(css).not.toContain(".vt-ck-meta");
    expect(tsx).not.toContain("PendingSlot");
    expect(tsx).not.toContain("data-tok");
  });

  it("the pill pattern finds the old gaps", () => {
    const old = '<span data-vt-no-i18n="1" data-tok="1" title="Awaiting a confirmed value from Vamos Taxi">City stay fee</span>';
    expect(old.match(PILL)).toHaveLength(1);
    expect('<span data-tok data-vt-no-i18n="1">Free cancellation window</span>'.match(PILL)).toHaveLength(1);
    expect('<span data-tok-fig="1">100% refunded</span>'.match(PILL)).toBeNull();
  });
});
