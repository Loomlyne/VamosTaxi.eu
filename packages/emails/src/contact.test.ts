import { describe, expect, it } from "vitest";
import { renderContactCustomerEmail, renderContactSupportEmail, renderStaffReplyEmail } from "./contact";

const locales = ["en", "de", "fr", "ar"] as const;
const unsafe = '<img src=x onerror="alert(1)">';

describe("contact email renderers (D-02 D-04)", () => {
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

    it(`renders escaped staff reply with name and booking_ref in ${locale}`, () => {
      const rendered = renderStaffReplyEmail(locale, {
        reply: `Line one\n${unsafe}`,
        name: `Ada${unsafe}`,
        bookingRef: `VT-10001${unsafe}`,
      });
      expect(rendered.html).toContain("wordmark-email.png");
      expect(rendered.html).toContain("Qurova");
      expect(rendered.html).toContain("Ada");
      expect(rendered.html).toContain("VT-10001");
      expect(rendered.html).toContain("Line one<br/>");
      expect(rendered.html).not.toContain(unsafe);
      expect(rendered.html).not.toContain("https://wa.me/41796267082");
      expect(rendered.html).not.toContain("wa.me");
      expect(rendered.html).not.toContain("border-radius:999px");
      expect(rendered.html).not.toMatch(/expires after 1 hour|works once/i);
      expect(rendered.subject).toBe(
        `Re: ${renderContactCustomerEmail(locale, { name: "Ada", message: "." }).subject}`,
      );
      if (locale === "ar") expect(rendered.html).toContain('dir="rtl"');
    });

    it(`omits the booking chip when bookingRef is empty in ${locale}`, () => {
      const rendered = renderStaffReplyEmail(locale, {
        reply: "Line one",
        name: "Ada",
        bookingRef: "",
      });
      expect(rendered.html).not.toContain("VT-10001");
      expect(rendered.html).not.toMatch(/VT-/);
    });
  }
});

describe("contact renderers keep $ sequences in names and references literal", () => {
  const tricky = "Ada $& $' $$";
  for (const locale of locales) {
    it(`customer greeting in ${locale}`, () => {
      const rendered = renderContactCustomerEmail(locale, { name: tricky, message: "." });
      expect(rendered.text).toContain(tricky);
      expect(rendered.text).not.toContain("{name}");
    });

    it(`staff reply greeting and booking chip in ${locale}`, () => {
      const rendered = renderStaffReplyEmail(locale, { reply: ".", name: tricky, bookingRef: "VT-$&-1" });
      expect(rendered.text).toContain(tricky);
      expect(rendered.text).toContain("VT-$&-1");
      expect(rendered.text).not.toMatch(/\{(name|bookingRef)\}/);
    });
  }
});

describe("contact e-mails: the phone reads left to right (261002 F1)", () => {
  const PHONE = "+41 79 626 70 82";
  const WRAPPED = `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">${PHONE}</span>`;
  const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/;
  const support = {
    name: "Amira",
    email: "amira@example.com",
    phone: PHONE,
    bookingRef: "VT-26-0807",
    message: "Can I add a child seat?",
  };
  const mails = (locale: (typeof locales)[number]) => ({
    customer: renderContactCustomerEmail(locale, { name: "Amira", message: "Hello" }),
    support: renderContactSupportEmail(locale, support),
    staff: renderStaffReplyEmail(locale, { reply: "Yes.", name: "Amira", bookingRef: "VT-26-0807" }),
  });

  for (const locale of locales) {
    it(`wraps every visible phone in the HTML in ${locale} (acknowledgement, support copy, reply)`, () => {
      for (const [name, mail] of Object.entries(mails(locale))) {
        expect(mail.html, name).toContain(WRAPPED);
        expect(mail.html.split(PHONE).length, name).toBe(mail.html.split(WRAPPED).length);
      }
      // The support copy shows the customer's phone too: also an island.
      expect(mails(locale).support.html).toContain(`<strong>Phone:</strong><br/>${WRAPPED}`);
    });
  }

  it("Arabic text: each phone sits between LRI and PDI", () => {
    const ar = mails("ar");
    expect(ar.customer.text.endsWith(`\n\n⁦${PHONE}⁩`)).toBe(true);
    expect(ar.staff.text.endsWith(`\n\n⁦${PHONE}⁩`)).toBe(true);
    expect(ar.support.text).toContain(`Phone: ⁦${PHONE}⁩`);
    expect(ar.support.text.endsWith(`\n\n⁦${PHONE}⁩`)).toBe(true);
  });

  it("en/de/fr text is byte for byte what it was", () => {
    const en = mails("en");
    expect(en.customer.text).toBe(
      "Vamos Taxi\n\nMessage received\n\nThank you, Amira. Our team will review your message.\n\nYour message\nHello\n\nContinue on WhatsApp: https://wa.me/41796267082\n\n+41 79 626 70 82",
    );
    expect(en.staff.text).toBe(
      "Vamos Taxi\n\nA reply from Vamos Taxi\n\nHello, Amira.\n\nWe wrote back to your message.\n\nBooking VT-26-0807\n\nOur reply\nYes.\n\n+41 79 626 70 82",
    );
    expect(en.support.text).toBe(
      "Vamos Taxi\n\nNew contact message\n\nName: Amira\n\nEmail: amira@example.com\n\nPhone: +41 79 626 70 82\n\nBooking reference: VT-26-0807\n\nMessage: Can I add a child seat?\n\n+41 79 626 70 82",
    );
    for (const locale of ["de", "fr"] as const) {
      for (const mail of Object.values(mails(locale))) {
        expect(mail.text.endsWith(`\n\n${PHONE}`)).toBe(true);
        expect(mail.text).not.toMatch(BIDI_MARKS);
      }
    }
  });
});
