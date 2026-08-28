import type { EmailLocale } from "./messages";

export function layoutHtml(locale: EmailLocale, inner: string): string {
  const dir = locale === "ar" ? "rtl" : "ltr"; // dir="rtl"
  // --vt-charcoal #1E1F1F, --vt-yellow #FDC20B, --vt-grey #DEDEDE (design-system/tokens/colors.css)
  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;background:#DEDEDE;color:#1E1F1F;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px"><tr><td style="font-weight:700;font-size:18px;color:#1E1F1F">Vamos Taxi</td></tr><tr><td style="padding-top:16px;border-top:4px solid #FDC20B">${inner}</td></tr></table></td></tr></table></body></html>`;
}

export function layoutText(inner: string): string {
  return `Vamos Taxi\n\n${inner}`;
}
