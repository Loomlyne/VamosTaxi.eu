import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function source(path: string): string {
  return readFileSync(join(webRoot, path), "utf8");
}

const contactPage = source("app/[locale]/contact/page.tsx");
const contactForm = source("components/forms/ContactForm.tsx");
const footer = source("components/shell/SiteFooter.tsx");
const channels = source("lib/contact-channels.ts");
const privacy = source("app/[locale]/privacy/page.tsx");
const imprint = source("app/[locale]/imprint/page.tsx");

const messages = Object.fromEntries(
  ["en", "de", "fr", "ar"].map((locale) => [
    locale,
    JSON.parse(source(`i18n/messages/${locale}.json`)).contact as Record<string, string>,
  ]),
) as Record<string, Record<string, string>>;

describe("React public contact surfaces", () => {
  it("uses verified support channels and never renders the unverified address or live-chat placeholders", () => {
    expect(channels).toContain('export const SUPPORT_EMAIL = "info@vamostaxi.site";');
    expect(channels).toContain('export const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}`;');
    expect(contactPage).toContain("{SUPPORT_EMAIL}");
    expect(contactPage).toContain('tContact("reply-within-12-24-hours")');
    expect(contactPage).toContain('tContact("support-availability")');
    expect(contactPage).toContain('tContact("whatsapp-available-24-7")');
    expect(contactPage).toContain('<Button size="md" variant="light" href={faqHref}>');

    for (const forbidden of [
      "PendingSlot",
      "Bleicherstrasse 16",
      "8953-dietikon",
      'tContact("live-chat")',
      'tContact("chat-hours")',
      'tContact("start-a-chat")',
    ]) {
      expect(contactPage).not.toContain(forbidden);
    }
  });

  it("renders an accepted-for-delivery state only after the strict contact API success response", () => {
    expect(contactForm).toContain("if (res.status === 200 && json.ok === true)");
    expect(contactForm).toContain('tContact("accepted-for-delivery-and-will-be-reviewed")');
    expect(contactForm).not.toContain('tContact("a-copy-is-on-its-way-to")');
    expect(contactForm).not.toContain("PendingSlot");
  });

  it("publishes only the four owner-confirmed social destinations", () => {
    for (const url of [
      "https://www.facebook.com/VAMOSTAXISWITZERLAND",
      "https://www.instagram.com/vamos.taxi?utm_source=qr",
      "https://www.youtube.com/@vamostaxi",
      "https://www.tiktok.com/@vamos.taxi",
    ]) {
      expect(footer).toContain(url);
    }
    expect(footer).toContain('<Icon name="youtube"');
    expect(footer).not.toContain('href="#"');
    expect(footer).not.toContain("star");
  });

  it("uses the confirmed mailbox on every React public legal and footer surface", () => {
    for (const publicSource of [footer, privacy, imprint]) {
      expect(publicSource).toContain("SUPPORT_EMAIL");
      expect(publicSource).toContain("SUPPORT_EMAIL_HREF");
      expect(publicSource).not.toContain("info@vamostaxi.eu");
    }
  });

  it("localises the same support facts without English placeholders", () => {
    for (const [locale, contact] of Object.entries(messages)) {
      expect(contact["reply-within-12-24-hours"]).toContain("12–24");
      expect(contact["support-availability"]).toContain("24/7");
      expect(contact["whatsapp-available-24-7"]).toContain("24/7");
      expect(contact["accepted-for-delivery-and-will-be-reviewed"]).toBeTruthy();
      expect(contact["open-whatsapp"]).toBeTruthy();
      for (const placeholder of [
        "a-copy-is-on-its-way-to",
        "chat-hours",
        "live-chat",
        "response-time",
        "start-a-chat",
        "support-email",
        "support-hours",
      ]) {
        expect(contact[placeholder], `${locale}: ${placeholder}`).toBeUndefined();
      }
    }
  });
});
