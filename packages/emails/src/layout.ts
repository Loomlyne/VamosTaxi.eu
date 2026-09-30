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

/** `locale` picks the default footer line of the plain-text layout (English when absent). */
export type EmailLayoutOptions = { footer?: string; locale?: EmailLocale };

export function layoutHtml(locale: EmailLocale, inner: string, options: EmailLayoutOptions = {}): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const footer = options.footer ?? `${t(locale, "auth", "email-footer-link")}<br/>\n            Vamos Taxi · +41 79 626 70 82`;
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light"/>
<title>Vamos Taxi</title>
</head>
<body style="margin:0;padding:0;background:${GREY};color:${CHARCOAL};font-family:${BODY_FONT};">
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
  const footer = options.footer ?? `${t(options.locale ?? "en", "auth", "email-footer-link")}\n+41 79 626 70 82`;
  return `Vamos Taxi\n\n${inner}\n\n${footer}`;
}

export function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
  <tr>
    <td bgcolor="${YELLOW}" style="background:${YELLOW};">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${BODY_FONT};font-size:16px;font-weight:700;line-height:20px;color:${CHARCOAL};text-decoration:none;">${label}</a>
    </td>
  </tr>
</table>`;
}

export function codeBlock(code: string, locale: EmailLocale): string {
  return `<p style="margin:20px 0 0 0;font-size:13px;color:${MUTED};">${t(locale, "auth", "email-code-label")}</p>
<p style="margin:8px 0 0 0;font-size:28px;line-height:36px;letter-spacing:6px;font-weight:700;color:${CHARCOAL};font-family:${BODY_FONT};">${code}</p>`;
}
