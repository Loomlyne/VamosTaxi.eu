import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { renderAuthEmail, type AuthEmailType } from "./auth";
import { BODY_FONT, DISPLAY_FONT } from "./chrome";
import { ConfirmationEmail } from "./ConfirmationEmail";
import { renderContactCustomerEmail, renderContactSupportEmail, renderStaffReplyEmail } from "./contact";
import { ltrHtml, ltrText, PHONE_DISPLAY, styleFont } from "./layout";
import { renderRefundEmail } from "./refund";
import type { BookingForEmail } from "./lib/types";

const LOCALES = ["en", "de", "fr", "ar"] as const;
const PHONE = "+41 79 626 70 82";
const WRAPPED = `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">${PHONE}</span>`;
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/;

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Strict start-tag tokenizer: every attribute must be `name` or `name="value"`, separated by
 * whitespace, up to an optional `/`. A double quote inside a style value (the old `"Segoe UI"`)
 * ends the attribute early and leaves `Segoe` glued to the closing quote: that is a parse error
 * here, as it is a broken declaration in a mail client. Returns the problems and every style value.
 */
function parseStartTags(html: string): { problems: string[]; styles: string[] } {
  const problems: string[] = [];
  const styles: string[] = [];
  for (const tag of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const attrs = tag[2] ?? "";
    const attr = /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/y;
    let at = 0;
    for (;;) {
      attr.lastIndex = at;
      const m = attr.exec(attrs);
      if (!m) break;
      if (m[1] === "style" && m[2] != null) styles.push(m[2].replaceAll("&quot;", '"').replaceAll("&#x27;", "'"));
      at = attr.lastIndex;
    }
    if (!/^\s*\/?$/.test(attrs.slice(at))) problems.push(tag[0].slice(0, 160));
  }
  return { problems, styles };
}

/** The `font-family` value of one style attribute, or null. */
function fontFamily(style: string): string | null {
  const decl = style
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("font-family:"));
  return decl ? decl.slice("font-family:".length).trim() : null;
}

function families(list: string): string[] {
  return list.split(",").map((f) => f.trim().replace(/^['"]|['"]$/g, ""));
}

describe("left-to-right helpers (261002 F1)", () => {
  it("ltrHtml wraps a value in a dir=ltr isolate and escapes it", () => {
    expect(ltrHtml(PHONE_DISPLAY)).toBe(WRAPPED);
    expect(ltrHtml("<b>1</b>")).toBe(
      '<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">&lt;b&gt;1&lt;/b&gt;</span>',
    );
  });

  it("ltrText adds LRI…PDI in Arabic only; en/de/fr get the value unchanged", () => {
    expect(ltrText("ar", PHONE)).toBe(`⁦${PHONE}⁩`);
    for (const locale of ["en", "de", "fr"] as const) expect(ltrText(locale, PHONE)).toBe(PHONE);
  });

  it("the public phone is the one number", () => {
    expect(PHONE_DISPLAY).toBe(PHONE);
  });
});

describe("default footer of layout.ts (auth e-mails)", () => {
  for (const locale of LOCALES) {
    it(`wraps the phone in the HTML footer in ${locale}`, () => {
      const out = renderAuthEmail("signup", locale, { name: "Amira", code: "123456", link: "https://vamostaxi.site/x" });
      expect(out.html).toContain(`Vamos Taxi · ${WRAPPED}`);
      expect(count(out.html, PHONE)).toBe(count(out.html, WRAPPED));
    });
  }

  it("plain text: Arabic footer phone in LRI…PDI, en/de/fr byte for byte as before", () => {
    const data = { name: "Amira", code: "123456", link: "https://vamostaxi.site/x" };
    expect(renderAuthEmail("signup", "ar", data).text.endsWith(`\n⁦${PHONE}⁩`)).toBe(true);
    expect(renderAuthEmail("signup", "en", data).text).toBe(
      [
        "Vamos Taxi",
        "",
        "Hello Amira.",
        "",
        "Confirm your email",
        "",
        "Tap the button to confirm this address. The link works once and expires after 1 hour.",
        "",
        "Confirm email: https://vamostaxi.site/x",
        "123456",
        "",
        "This link works once and expires after 1 hour.",
        PHONE,
      ].join("\n"),
    );
    for (const locale of ["en", "de", "fr"] as const) {
      const text = renderAuthEmail("signup", locale, data).text;
      expect(text.endsWith(`\n${PHONE}`)).toBe(true);
      expect(text).not.toMatch(BIDI_MARKS);
    }
  });
});

describe("font list survives the style attribute (261002 F3)", () => {
  const body = styleFont(BODY_FONT);
  const display = styleFont(DISPLAY_FONT);

  it("styleFont turns the inner double quotes into single quotes and nothing else", () => {
    expect(BODY_FONT).toContain('"Segoe UI"');
    expect(body).toBe(BODY_FONT.replaceAll('"', "'"));
    expect(body).not.toContain('"');
    expect(display).toBe(DISPLAY_FONT);
  });

  it("the check catches the old broken attribute", () => {
    const old = `<body style="margin:0;font-family:${BODY_FONT};"><p>x</p></body>`;
    expect(parseStartTags(old).problems).toHaveLength(1);
  });

  const auth = (type: AuthEmailType, locale: (typeof LOCALES)[number]) =>
    renderAuthEmail(type, locale, { name: "Amira", code: "123456", link: "https://vamostaxi.site/x" }).html;
  const stringMails: Array<[string, (locale: (typeof LOCALES)[number]) => string]> = [
    ["auth signup (layout.ts)", (l) => auth("signup", l)],
    ["auth account_signin (ctaButton + codeBlock)", (l) => auth("account_signin", l)],
    ["refund pending", (l) => renderRefundEmail(l, "pending", { name: "Amira", reference: "VT-26-0807" }).html],
    ["refund issued", (l) => renderRefundEmail(l, "issued", { name: "Amira", reference: "VT-26-0807" }).html],
    ["contact customer", (l) => renderContactCustomerEmail(l, { name: "Amira", message: "Hello\nthere" }).html],
    [
      "contact support copy",
      (l) =>
        renderContactSupportEmail(l, {
          name: "Amira",
          email: "amira@example.com",
          phone: PHONE,
          bookingRef: "VT-26-0807",
          message: "m",
        }).html,
    ],
    ["contact staff reply", (l) => renderStaffReplyEmail(l, { reply: "ok", name: "Amira", bookingRef: "VT-26-0807" }).html],
  ];

  for (const [name, make] of stringMails) {
    for (const locale of LOCALES) {
      it(`${name} ${locale}: every start tag parses and font-family holds the whole list`, () => {
        const { problems, styles } = parseStartTags(make(locale));
        expect(problems).toEqual([]);
        const fonts = styles.map(fontFamily).filter((f): f is string => f != null);
        expect(fonts.length).toBeGreaterThan(0);
        for (const font of fonts) expect([body, display]).toContain(font);
        expect(fonts).toContain(body);
        expect(families(body)).toEqual(["Poppins", "system-ui", "-apple-system", "Segoe UI", "sans-serif"]);
      });
    }
  }

  it("the React confirmation was already valid and still is", async () => {
    const booking: BookingForEmail = {
      reference: "VT-26-0807",
      contactName: "Amira",
      contactEmail: "amira@example.com",
      locale: "ar",
      displayCurrency: "CHF",
      totalRappen: null,
      manageUrl: "https://vamostaxi.site/x",
      legs: [],
    };
    const { problems, styles } = parseStartTags(await render(ConfirmationEmail({ booking })));
    expect(problems).toEqual([]);
    const fonts = styles.map(fontFamily).filter((f): f is string => f != null);
    expect(fonts).toContain(BODY_FONT);
  });
});
