import { escapeHtml } from "./escape";
import { layoutHtml, layoutText } from "./layout";
import type { EmailLocale } from "./messages";

export type ContactCustomerEmailData = { name: string; message: string };
export type ContactSupportEmailData = {
  name: string;
  email: string;
  phone: string;
  bookingRef: string;
  message: string;
};
export type StaffReplyEmailData = { reply: string };

type Copy = {
  customerSubject: string;
  customerHeading: string;
  customerBody: string;
  customerQuoteLabel: string;
  customerCta: string;
  supportSubject: string;
  supportHeading: string;
  staffSubject: string;
  staffHeading: string;
  staffBody: string;
  staffQuoteLabel: string;
};

const WHATSAPP_HREF = "https://wa.me/41796267082";
const LOGO = "https://vamostaxi.site/brand/logo/wordmark-email.png";
const YELLOW = "#FDC20B";
const CHARCOAL = "#1E1F1F";
const GREY = "#DEDEDE";
const MUTED = "#545756";
const WHITE = "#FFFFFF";
const DISPLAY_FONT = "Qurova, Poppins, system-ui, sans-serif";
const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';
const CONTACT_FOOTER = "+41 79 626 70 82";

const COPY: Record<EmailLocale, Copy> = {
  en: {
    customerSubject: "We received your message — Vamos Taxi",
    customerHeading: "Message received",
    customerBody: "Thank you, {name}. Our team will review your message.",
    customerQuoteLabel: "Your message",
    customerCta: "Continue on WhatsApp",
    supportSubject: "New contact message — Vamos Taxi",
    supportHeading: "New contact message",
    staffSubject: "Reply from Vamos Taxi",
    staffHeading: "A reply from Vamos Taxi",
    staffBody: "We wrote back to your message.",
    staffQuoteLabel: "Our reply",
  },
  de: {
    customerSubject: "Wir haben Ihre Nachricht erhalten — Vamos Taxi",
    customerHeading: "Nachricht erhalten",
    customerBody: "Danke, {name}. Unser Team prüft Ihre Nachricht.",
    customerQuoteLabel: "Ihre Nachricht",
    customerCta: "Weiter auf WhatsApp",
    supportSubject: "Neue Kontaktanfrage — Vamos Taxi",
    supportHeading: "Neue Kontaktanfrage",
    staffSubject: "Antwort von Vamos Taxi",
    staffHeading: "Eine Antwort von Vamos Taxi",
    staffBody: "Wir haben auf Ihre Nachricht geantwortet.",
    staffQuoteLabel: "Unsere Antwort",
  },
  fr: {
    customerSubject: "Nous avons reçu votre message — Vamos Taxi",
    customerHeading: "Message reçu",
    customerBody: "Merci, {name}. Notre équipe examinera votre message.",
    customerQuoteLabel: "Votre message",
    customerCta: "Continuer sur WhatsApp",
    supportSubject: "Nouveau message de contact — Vamos Taxi",
    supportHeading: "Nouveau message de contact",
    staffSubject: "Réponse de Vamos Taxi",
    staffHeading: "Une réponse de Vamos Taxi",
    staffBody: "Nous avons répondu à votre message.",
    staffQuoteLabel: "Notre réponse",
  },
  ar: {
    customerSubject: "تلقينا رسالتك — Vamos Taxi",
    customerHeading: "تم استلام الرسالة",
    customerBody: "شكرًا، {name}. سيقوم فريقنا بمراجعة رسالتك.",
    customerQuoteLabel: "رسالتك",
    customerCta: "متابعة على واتساب",
    supportSubject: "رسالة تواصل جديدة — Vamos Taxi",
    supportHeading: "رسالة تواصل جديدة",
    staffSubject: "رد من Vamos Taxi",
    staffHeading: "رد من Vamos Taxi",
    staffBody: "رددنا على رسالتك.",
    staffQuoteLabel: "ردنا",
  },
};

function quotedMessageHtml(message: string): string {
  return escapeHtml(message).replaceAll("\n", "<br/>");
}

function headingHtml(text: string): string {
  return `<p style="margin:20px 0 0;font-family:${DISPLAY_FONT};font-size:28px;line-height:34px;font-weight:600;color:${CHARCOAL};">${escapeHtml(text)}</p>`;
}

function mutedHtml(text: string): string {
  return `<p style="margin:10px 0 0;font-size:14px;line-height:22px;color:${MUTED};font-family:${BODY_FONT};">${escapeHtml(text)}</p>`;
}

function kickerHtml(text: string): string {
  return `<p style="margin:0;font-size:11px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.08em;font-family:${BODY_FONT};">${escapeHtml(text)}</p>`;
}

function quoteHtml(message: string): string {
  return `<p style="margin:8px 0 0;font-size:16px;line-height:22px;font-weight:600;color:${CHARCOAL};font-family:${BODY_FONT};">${quotedMessageHtml(message)}</p>`;
}

function charcoalPill(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 0;">
  <tr>
    <td>
      <a href="${escapeHtml(href)}" style="display:block;padding:14px 24px;background:${CHARCOAL};color:${WHITE};border-radius:999px;font-family:${DISPLAY_FONT};font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;text-align:center;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

function voucherHtml(locale: EmailLocale, headerInner: string, bodyInner: string): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
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
            <img src="${LOGO}" width="216" height="30" alt="Vamos Taxi" style="display:block;width:216px;height:30px;border:0;outline:none;"/>
            ${headerInner}
          </td>
        </tr>
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background:${YELLOW};">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px 32px;">
            ${bodyInner}
            <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:${MUTED};font-family:${BODY_FONT};">${CONTACT_FOOTER}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function voucherText(heading: string, body: string, quoteLabel: string, quote: string, cta: string): string {
  return `Vamos Taxi\n\n${heading}\n\n${body}\n\n${quoteLabel}\n${quote}\n\n${cta}: ${WHATSAPP_HREF}\n\n${CONTACT_FOOTER}`;
}

export function renderContactCustomerEmail(locale: EmailLocale, data: ContactCustomerEmailData) {
  const copy = COPY[locale];
  const name = data.name.trim();
  const body = copy.customerBody.replace("{name}", name);
  return {
    subject: copy.customerSubject,
    html: voucherHtml(
      locale,
      `${headingHtml(copy.customerHeading)}${mutedHtml(body)}`,
      `${kickerHtml(copy.customerQuoteLabel)}${quoteHtml(data.message)}${charcoalPill(WHATSAPP_HREF, copy.customerCta)}`,
    ),
    text: voucherText(copy.customerHeading, body, copy.customerQuoteLabel, data.message, copy.customerCta),
  };
}

export function renderStaffReplyEmail(locale: EmailLocale, data: StaffReplyEmailData) {
  const copy = COPY[locale];
  return {
    subject: copy.staffSubject,
    html: voucherHtml(
      locale,
      `${headingHtml(copy.staffHeading)}${mutedHtml(copy.staffBody)}`,
      `${kickerHtml(copy.staffQuoteLabel)}${quoteHtml(data.reply)}${charcoalPill(WHATSAPP_HREF, copy.customerCta)}`,
    ),
    text: voucherText(copy.staffHeading, copy.staffBody, copy.staffQuoteLabel, data.reply, copy.customerCta),
  };
}

export function renderContactSupportEmail(locale: EmailLocale, data: ContactSupportEmailData) {
  const copy = COPY[locale];
  const fields: Array<[string, string]> = [
    ["Name", data.name],
    ["Email", data.email],
    ["Phone", data.phone],
    ["Booking reference", data.bookingRef],
    ["Message", data.message],
  ].filter((field): field is [string, string] => field[1]!.length > 0);
  const htmlFields = fields
    .map(([label, value]) => `<p style="margin:0 0 12px;"><strong>${escapeHtml(label)}:</strong><br/>${escapeHtml(value)}</p>`)
    .join("");
  const textFields = fields.map(([label, value]) => `${label}: ${value}`).join("\n\n");
  return {
    subject: copy.supportSubject,
    html: layoutHtml(locale, `<p style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;">${escapeHtml(copy.supportHeading)}</p>${htmlFields}`, {
      footer: CONTACT_FOOTER,
    }),
    text: layoutText(`${copy.supportHeading}\n\n${textFields}`, { footer: CONTACT_FOOTER }),
  };
}
