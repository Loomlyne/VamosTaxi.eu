// Source pins for the cookies and privacy mocks (27-09): D-14, D-16a, D-29, D-30, D-31.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const cookies = read("app/pages/cookies.dc.html");
const privacy = read("app/pages/privacy.dc.html");
const dict = read("app/vamos-i18n-dict.js");

describe("cookies mock (27-09)", () => {
  it("D-16a: no Reset button, no reset line, no reset handler", () => {
    expect(cookies).not.toContain("Reset my choice");
    expect(cookies).not.toContain("Resetting clears");
    expect(cookies).not.toContain("resetConsent");
  });

  it("the current-choice panel reads the server record, not localStorage or a poll", () => {
    expect(cookies).toContain("VamosConsent.state()");
    expect(cookies).toContain("VamosConsent.onChange");
    expect(cookies).not.toContain("localStorage");
    expect(cookies).not.toContain("setInterval");
    expect(cookies).toContain("Change preferences");
  });

  it("Marketing: the owner-approved lead sentence and the _fbp / Google rows (2026-10-19)", () => {
    const sec = cookies.match(/<section id="marketing">[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(sec).toContain("<p>Measures whether our adverts on Google, Facebook and Instagram lead to bookings, and lets us show our adverts to people who visited the site. Off until you allow it.</p>");
    expect(sec).toContain("<caption>Marketing — off until you allow it</caption>");
    expect(sec).toContain("Meta Pixel · Meta Platforms Ireland Ltd");
    expect(sec).toContain("Google Tag Manager · Google Ireland Ltd");
    expect(sec).not.toContain("Nothing in this category is running today");
    expect(cookies).not.toContain("data-cookies-row");
  });

  it("D-30: necessary row name and duration, purpose and provider unchanged", () => {
    expect(cookies.split("consent_subject · vamosCookieConsent")).toHaveLength(2);
    // 2026-10-04: plain name first ("Your cookie choice"), technical name underneath.
    const row = cookies.match(/<tr><td data-l="Name"><span data-ck-name="1"><span data-ck-plain="1">Your cookie choice<\/span><span data-ck-tech="1" class="vt-dir-keep"[^>]*>consent_subject[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(row).toContain("Records which categories you allowed, so we can prove it and stop asking");
    expect(row).toContain('<td data-l="Provider">Vamos Taxi</td>');
    expect(row).toContain('<td data-l="Duration">1 year</td>');
    expect(dict).toMatch(/'1 year': \{ de: '1 Jahr', fr: '1 an', ar: 'سنة واحدة' \}/);
  });
});

describe("privacy mock (27-09)", () => {
  it("section 04 lists the suppliers and carries no extra line", () => {
    const sec = privacy.match(/<section id="processors">[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(sec).toContain("Stripe Payments Europe Ltd");
    expect(sec).not.toContain("data-privacy-line");
  });

  it("D-31 (owner, 2026-10-05): privacy shows its own Last updated day, not the consent version", () => {
    expect(privacy).toContain("label('privacy', lang)");
    expect(privacy).not.toContain("consentLabel");
  });
});
