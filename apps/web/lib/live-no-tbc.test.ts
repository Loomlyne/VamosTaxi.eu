// Owner decision 2026-09-30 (question form, legal follow-up): no TBC on any page a customer can
// see. The live public pages are the DC mocks (apps/web/middleware.ts DC_PAGES); the Next.js
// routes that are live render the cookie banner. Review galleries (*States.dc.html) are not
// served to customers and are skipped.
//
// One later, narrower owner answer (2026-10-03, 26.2 audit U07-2, "Labelled TBC gaps",
// .planning/decisions/2026-10-03-audit-owner-answers.md): the /imprint values the company
// still owes are shown as labelled TBC pills instead of internal review notes. Exactly
// those pills are allowed, on that page only; any other pill anywhere still fails.
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

/** U07-2 (owner 2026-10-03): the only pills a live page may carry, by file and label. */
const ALLOWED_PILLS: Record<string, string[]> = {
  "app/pages/imprint.dc.html": [
    "licensing authority",
    "licence number",
    "dispute resolution body",
    "content and links disclaimer",
  ],
};

function pillLabel(match: string): string {
  return match.slice(match.indexOf(">") + 1, -1).trim();
}

describe("no TBC on live pages", () => {
  it("no live mock renders a TBC pill (except the U07-2 imprint gaps)", () => {
    const found = mockFiles().flatMap((rel) => {
      const src = readFileSync(join(repoRoot, rel), "utf8").replace(/<style[\s\S]*?<\/style>/gi, "");
      const allowed = ALLOWED_PILLS[rel] ?? [];
      return [...src.matchAll(PILL)]
        .filter((m) => !allowed.includes(pillLabel(m[0])))
        .map((m) => `${rel}: ${m[0].slice(0, 120)}`);
    });
    expect(found).toEqual([]);
  });

  it("the imprint carries exactly the U07-2 pills, each once", () => {
    const rel = "app/pages/imprint.dc.html";
    const src = readFileSync(join(repoRoot, rel), "utf8").replace(/<style[\s\S]*?<\/style>/gi, "");
    expect([...src.matchAll(PILL)].map((m) => pillLabel(m[0]))).toEqual(ALLOWED_PILLS[rel]);
    expect(src).not.toContain("data-slot");
    expect(src).not.toContain("Client input");
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
