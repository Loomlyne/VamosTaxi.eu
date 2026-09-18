import { describe, expect, it } from "vitest";
import { renderAuthEmail } from "./auth";

const TYPES = ["signup", "recovery", "otp", "email_change", "invite", "reauthentication"] as const;
const LOCALES = ["en", "de", "fr", "ar"] as const;

describe("renderAuthEmail", () => {
  for (const type of TYPES) {
    for (const locale of LOCALES) {
      it(`${type} ${locale}`, () => {
        const out = renderAuthEmail(type, locale, {
          name: "Anna",
          code: "123456",
          link: "https://vamostaxi.site/x",
        });
        expect(out.subject.length).toBeGreaterThan(0);
        expect(out.html.includes("123456") || out.html.includes("https://vamostaxi.site/x")).toBe(true);
        if (locale !== "en") {
          const en = renderAuthEmail(type, "en", {
            name: "Anna",
            code: "123456",
            link: "https://vamostaxi.site/x",
          });
          expect(out.subject).not.toBe(en.subject);
        }
      });
    }
  }

  it("signup en uses wordmark chrome without Arial (D-03)", () => {
    const out = renderAuthEmail("signup", "en", {
      name: "Anna",
      code: "123456",
      link: "https://vamostaxi.site/x",
    });
    expect(out.html).not.toMatch(/Arial/);
    expect(out.html).toContain("wordmark-email.png");
    expect(out.html).toContain('width="216"');
    expect(out.html).not.toMatch(/yellow-50/);
    expect(out.html).not.toMatch(/#FFF8|#FEF3|#FFFBEB/);
  });

  it("arabic rtl", () => {
    const out = renderAuthEmail("signup", "ar", {
      name: "Anna",
      code: "123456",
      link: "https://vamostaxi.site/x",
    });
    expect(out.html).toContain('lang="ar"');
    expect(out.html).toContain('dir="rtl"');
    expect(out.html).not.toMatch(/Arial/);
    expect(out.html).toContain("wordmark-email.png");
    expect(out.html).toContain('width="216"');
  });

  it("escapes script in name", () => {
    const out = renderAuthEmail("signup", "en", {
      name: "<script>alert(1)</script>",
      code: "123456",
      link: "https://vamostaxi.site/x",
    });
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).not.toContain("<script>");
  });
});
