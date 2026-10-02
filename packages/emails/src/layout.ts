import { t, type EmailLocale } from "./messages";
import {
  BODY_FONT,
  CHARCOAL,
  GREY,
  LOGO,
  LOGO_HEIGHT,
  LOGO_WIDTH,
  MUTED,
  WHITE,
  YELLOW,
} from "./chrome";
import { escapeHtml } from "./escape";

/** The public phone as every e-mail prints it (the `tel:` / `wa.me` forms stay where they are used). */
export const PHONE_DISPLAY = "+41 79 626 70 82";

/**
 * HTML: `value` in a left-to-right island, so an Arabic (right-to-left) e-mail shows
 * `+41 79 626 70 82` and not `82 70 626 79 41+`. A no-op in en/de/fr. 261002 F1.
 */
export function ltrHtml(value: string): string {
  return `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">${escapeHtml(value)}</span>`;
}

/**
 * Plain text: in Arabic, `value` between U+2066 LEFT-TO-RIGHT ISOLATE and U+2069 POP
 * DIRECTIONAL ISOLATE (invisible); every other language gets `value` unchanged, byte for byte.
 */
export function ltrText(locale: EmailLocale, value: string): string {
  return locale === "ar" ? `⁦${value}⁩` : value;
}

/**
 * A font list for a double-quoted `style="…"` attribute. `BODY_FONT` holds `"Segoe UI"`; its
 * double quotes would end the attribute early and the e-mail would fall back to a serif
 * (261002 F3). Single quotes are the same CSS. The React e-mails keep the constant as it is:
 * React escapes the quotes itself.
 */
export function styleFont(fontList: string): string {
  return fontList.replaceAll('"', "'");
}

/** `locale` picks the default footer line of the plain-text layout (English when absent). */
export type EmailLayoutOptions = { footer?: string; locale?: EmailLocale };

export function layoutHtml(locale: EmailLocale, inner: string, options: EmailLayoutOptions = {}): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const footer = options.footer ?? `${t(locale, "auth", "email-footer-link")}<br/>\n            Vamos Taxi · ${ltrHtml(PHONE_DISPLAY)}`;
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light"/>
<title>Vamos Taxi</title>
</head>
<body style="margin:0;padding:0;background:${GREY};color:${CHARCOAL};font-family:${styleFont(BODY_FONT)};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${GREY}" style="background:${GREY};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="${WHITE}" style="background:${WHITE};max-width:560px;width:100%;">
        <tr>
          <td style="padding:28px 32px 20px 32px;">
            <img src="${LOGO}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="Vamos Taxi" style="display:block;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;border:0;outline:none;"/>
          </td>
        </tr>
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background:${YELLOW};">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px 32px;font-size:16px;line-height:24px;color:${CHARCOAL};">
            ${inner}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 32px 32px;font-size:12px;line-height:18px;color:${MUTED};">
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function layoutText(inner: string, options: EmailLayoutOptions = {}): string {
  const locale = options.locale ?? "en";
  const footer = options.footer ?? `${t(locale, "auth", "email-footer-link")}\n${ltrText(locale, PHONE_DISPLAY)}`;
  return `Vamos Taxi\n\n${inner}\n\n${footer}`;
}

export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
  <tr>
    <td bgcolor="${YELLOW}" style="background:${YELLOW};">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${styleFont(BODY_FONT)};font-size:16px;font-weight:700;line-height:20px;color:${CHARCOAL};text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`;
}

export function codeBlock(code: string, locale: EmailLocale): string {
  return `<p style="margin:20px 0 0 0;font-size:13px;color:${MUTED};">${t(locale, "auth", "email-code-label")}</p>
<p style="margin:8px 0 0 0;font-size:28px;line-height:36px;letter-spacing:6px;font-weight:700;color:${CHARCOAL};font-family:${styleFont(BODY_FONT)};">${code}</p>`;
}
