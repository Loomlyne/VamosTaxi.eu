import { describe, expect, it } from "vitest";
import { renderContactCustomerEmail, renderContactSupportEmail, renderStaffReplyEmail } from "./contact";

const locales = ["en", "de", "fr", "ar"] as const;
const unsafe = '<img src=x onerror="alert(1)">';

describe("contact email renderers", () => {
  for (const locale of locales) {
    it(`renders escaped customer acknowledgement in ${locale}`, () => {
      const rendered = renderContactCustomerEmail(locale, { name: unsafe, message: `Line one\n${unsafe}` });
      expect(rendered.html).toContain("<!doctype html>");
      expect(rendered.text).toContain("Vamos Taxi");
      expect(rendered.html).toContain("wordmark-email.png");
      expect(rendered.html).toContain("Qurova");
      expect(rendered.html).toContain("border-radius:999px");
      expect(rendered.html).toContain("width=\"216\"");
      expect(rendered.html).toContain("Line one<br/>");
      expect(rendered.html).toContain("https://wa.me/41796267082");
      expect(rendered.text).toContain("https://wa.me/41796267082");
      expect(rendered.text).toContain("Line one");
      expect(rendered.html).not.toContain(unsafe);
      expect(rendered.html).not.toMatch(/font-size:22px/);
      expect(rendered.html).not.toMatch(/expires after 1 hour|works once/i);
      if (locale === "ar") expect(rendered.html).toContain('dir="rtl"');
    });

    it(`renders escaped support notification in ${locale}`, () => {
      const rendered = renderContactSupportEmail(locale, {
        name: unsafe,
        email: "customer@example.test",
        phone: "+41 79 626 70 82",
        bookingRef: "",
        message: unsafe,
      });
      expect(rendered.html).toContain("<!doctype html>");
      expect(rendered.text).toContain("customer@example.test");
      expect(rendered.html).not.toContain(unsafe);
      expect(rendered.html).not.toMatch(/expires after 1 hour|works once/i);
      if (locale === "ar") expect(rendered.html).toContain('dir="rtl"');
    });

    it(`renders escaped staff reply in ${locale}`, () => {
      const rendered = renderStaffReplyEmail(locale, { reply: `Line one\n${unsafe}` });
      expect(rendered.html).toContain("wordmark-email.png");
      expect(rendered.html).toContain("Qurova");
      expect(rendered.html).toContain("border-radius:999px");
      expect(rendered.html).toContain("Line one<br/>");
      expect(rendered.html).toContain("https://wa.me/41796267082");
      expect(rendered.html).not.toContain(unsafe);
      expect(rendered.html).not.toMatch(/expires after 1 hour|works once/i);
      if (locale === "ar") expect(rendered.html).toContain('dir="rtl"');
    });
  }
});
