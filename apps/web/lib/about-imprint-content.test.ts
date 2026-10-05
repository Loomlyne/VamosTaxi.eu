// apps/web/lib/about-imprint-content.test.ts
//
// Owner answers 7 and 8, 2026-10-05 (.planning/decisions/2026-10-05-repo-investigation-answers.md):
//  - /about: "Hide the box until there is a photo". The dashed "Image slot — the founder" box and its
//    English brief must not reach a visitor; the founder section stays readable without it, and a
//    commented restore line keeps the markup for the day a photo exists.
//  - /imprint 09: "Remove the note, keep the credits". The internal note about agencies agreeing
//    to a credit is gone in every language; the two credit rows stay.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const withoutComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "");

describe("/about founder image box", () => {
  const about = read("app/pages/about.dc.html");
  const live = withoutComments(about);

  it("renders no image slot box and no brief for it", () => {
    expect(live).not.toMatch(/data-imgslot=/);
    expect(live).not.toMatch(/Image slot/);
    expect(live).not.toMatch(/No photograph exists today/);
  });

  it("keeps the founder text and lets it use the full width", () => {
    expect(live).toContain("Founder-led, and answerable");
    expect(live).toContain("run by its owner, Ben Othman Houssein");
    expect(live).toMatch(/<div data-split="1" data-solo="1">/);
    expect(about).toMatch(/\[data-split\]\[data-solo\]\{grid-template-columns:minmax\(0,1fr\)\}/);
  });

  it("leaves a commented restore line holding the box markup", () => {
    const comment = about.match(/<!-- Founder image box hidden until there is a photo[\s\S]*?-->/);
    expect(comment).not.toBeNull();
    expect(comment![0]).toContain("Restore: delete data-solo");
    expect(comment![0]).toContain('<div data-imgslot="1">');
    expect(comment![0]).toContain("<strong>Image slot — the founder</strong>");
  });
});

describe("/imprint section 09", () => {
  const imprint = read("app/pages/imprint.dc.html");
  const NOTE_EN = "Credit only where the agencies agree";
  const NOTE_DE = "Nennung nur, wenn die Agenturen zustimmen";

  it("keeps both credits and drops the internal note in every source", () => {
    const section = imprint.slice(imprint.indexOf('<section id="credits">'));
    expect(section).toContain("Brand and design");
    expect(section).toContain("Website");
    expect((section.slice(0, section.indexOf("</section>")).match(/Loomlyne/g) ?? []).length).toBe(2);
    expect(imprint).not.toContain(NOTE_EN);
    expect(imprint).not.toContain(NOTE_DE);
    expect(read("app/vamos-i18n-dict.js")).not.toContain(NOTE_EN);
    expect(read("apps/web/app/[locale]/imprint/page.tsx")).not.toContain("credit-only-where-the-agencies-agree");
  });

  it("is gone from the message files in all four languages", () => {
    for (const l of ["en", "de", "fr", "ar"]) {
      const messages = JSON.parse(read(`apps/web/i18n/messages/${l}.json`));
      expect(messages.legal["credit-only-where-the-agencies-agree-otherwise-t"], l).toBeUndefined();
    }
  });
});
