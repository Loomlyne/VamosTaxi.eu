import {
  BODY_FONT,
  CHARCOAL,
  DISPLAY_FONT,
  GREY,
  LOGO,
  MUTED,
  WHITE,
  YELLOW,
} from "./chrome";
import { escapeHtml } from "./escape";
import { layoutHtml, layoutText, ltrHtml, ltrText, PHONE_DISPLAY, styleFont } from "./layout";
import type { EmailLocale } from "./messages";

export type ContactCustomerEmailData = { name: string; message: string };
export type ContactSupportEmailData = {
  name: string;
  email: string;
  phone: string;
  bookingRef: string;
  message: string;
};
export type StaffReplyEmailData = { reply: string; name: string; bookingRef?: string };

type Copy = {
  customerSubject: string;
  customerHeading: string;
  customerBody: string;
  customerQuoteLabel: string;
  customerCta: string;
  supportSubject: string;
  supportHeading: string;
  staffHeading: string;
  staffHello: string;
  staffBody: string;
  staffBookingChip: string;
  staffQuoteLabel: string;
};

const WHATSAPP_HREF = "https://wa.me/41796267082";

const COPY: Record<EmailLocale, Copy> = {
  en: {
    customerSubject: "We received your message — Vamos Taxi",
    customerHeading: "Message received",
    customerBody: "Thank you, {name}. Our team will review your message.",
    customerQuoteLabel: "Your message",
    customerCta: "Continue on WhatsApp",
    supportSubject: "New contact message — Vamos Taxi",
    supportHeading: "New contact message",
    staffHeading: "A reply from Vamos Taxi",
    staffHello: "Hello, {name}.",
    staffBody: "We wrote back to your message.",
    staffBookingChip: "Booking {bookingRef}",
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
    staffHeading: "Eine Antwort von Vamos Taxi",
    staffHello: "Hallo, {name}.",
    staffBody: "Wir haben auf Ihre Nachricht geantwortet.",
    staffBookingChip: "Buchung {bookingRef}",
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
    staffHeading: "Une réponse de Vamos Taxi",
    staffHello: "Bonjour, {name}.",
    staffBody: "Nous avons répondu à votre message.",
    staffBookingChip: "Réservation {bookingRef}",
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
    staffHeading: "رد من Vamos Taxi",
    staffHello: "مرحبا، {name}.",
    staffBody: "رددنا على رسالتك.",
    staffBookingChip: "الحجز {bookingRef}",
    staffQuoteLabel: "ردنا",
  },
};

function quotedMessageHtml(message: string): string {
  return escapeHtml(message).replaceAll("\n", "<br/>");
}

function headingHtml(text: string): string {
  return `<p style="margin:20px 0 0;font-family:${styleFont(DISPLAY_FONT)};font-size:28px;line-height:34px;font-weight:600;color:${CHARCOAL};">${escapeHtml(text)}</p>`;
}

function mutedHtml(text: string): string {
  return `<p style="margin:10px 0 0;font-size:14px;line-height:22px;color:${MUTED};font-family:${styleFont(BODY_FONT)};">${escapeHtml(text)}</p>`;
}

function kickerHtml(text: string): string {
  return `<p style="margin:0;font-size:11px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.08em;font-family:${styleFont(BODY_FONT)};">${escapeHtml(text)}</p>`;
}

function quoteHtml(message: string): string {
  return `<p style="margin:8px 0 0;font-size:16px;line-height:22px;font-weight:600;color:${CHARCOAL};font-family:${styleFont(BODY_FONT)};">${quotedMessageHtml(message)}</p>`;
}

function charcoalPill(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0 0;">
  <tr>
    <td>
      <a href="${escapeHtml(href)}" style="display:block;padding:14px 24px;background:${CHARCOAL};color:${WHITE};border-radius:999px;font-family:${styleFont(DISPLAY_FONT)};font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;text-align:center;">${escapeHtml(label)}</a>
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
<body style="margin:0;padding:0;background:${GREY};color:${CHARCOAL};font-family:${styleFont(BODY_FONT)};">
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
            <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:${MUTED};font-family:${styleFont(BODY_FONT)};">${ltrHtml(PHONE_DISPLAY)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function voucherText(
  locale: EmailLocale,
  heading: string,
  body: string,
  quoteLabel: string,
  quote: string,
  cta?: string,
): string {
  const ctaBlock = cta ? `\n\n${cta}: ${WHATSAPP_HREF}` : "";
  return `Vamos Taxi\n\n${heading}\n\n${body}\n\n${quoteLabel}\n${quote}${ctaBlock}\n\n${ltrText(locale, PHONE_DISPLAY)}`;
}

/** Subject of the acknowledgement the customer holds; a reply uses "Re: " + this to stay in their thread. */
export function contactCustomerSubject(locale: EmailLocale): string {
  return (COPY[locale] ?? COPY.en).customerSubject;
}

export function renderContactCustomerEmail(locale: EmailLocale, data: ContactCustomerEmailData) {
  const copy = COPY[locale];
  const name = data.name.trim();
  const body = copy.customerBody.replace("{name}", () => name);
  return {
    subject: copy.customerSubject,
    html: voucherHtml(
      locale,
      `${headingHtml(copy.customerHeading)}${mutedHtml(body)}`,
      `${kickerHtml(copy.customerQuoteLabel)}${quoteHtml(data.message)}${charcoalPill(WHATSAPP_HREF, copy.customerCta)}`,
    ),
    text: voucherText(locale, copy.customerHeading, body, copy.customerQuoteLabel, data.message, copy.customerCta),
  };
}

export function renderStaffReplyEmail(locale: EmailLocale, data: StaffReplyEmailData) {
  const copy = COPY[locale];
  const name = data.name.trim();
  const hello = copy.staffHello.replace("{name}", () => name);
  const bookingRef = data.bookingRef?.trim() ?? "";
  const bookingLine = bookingRef ? copy.staffBookingChip.replace("{bookingRef}", () => bookingRef) : "";
  const bookingChip = bookingLine ? mutedHtml(bookingLine) : "";
  const body = bookingLine ? `${hello}\n\n${copy.staffBody}\n\n${bookingLine}` : `${hello}\n\n${copy.staffBody}`;
  return {
    subject: `Re: ${copy.customerSubject}`,
    html: voucherHtml(
      locale,
      `${headingHtml(copy.staffHeading)}${mutedHtml(hello)}${mutedHtml(copy.staffBody)}${bookingChip}`,
      `${kickerHtml(copy.staffQuoteLabel)}${quoteHtml(data.reply)}`,
    ),
    text: voucherText(locale, copy.staffHeading, body, copy.staffQuoteLabel, data.reply),
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
  // A phone number reads left to right in an Arabic copy too (261002 F1): ours in the footer and
  // the one the customer typed.
  const htmlFields = fields
    .map(([label, value]) => {
      const shown = label === "Phone" ? ltrHtml(value) : escapeHtml(value);
      return `<p style="margin:0 0 12px;"><strong>${escapeHtml(label)}:</strong><br/>${shown}</p>`;
    })
    .join("");
  const textFields = fields
    .map(([label, value]) => `${label}: ${label === "Phone" ? ltrText(locale, value) : value}`)
    .join("\n\n");
  return {
    subject: copy.supportSubject,
    html: layoutHtml(locale, `<p style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;">${escapeHtml(copy.supportHeading)}</p>${htmlFields}`, {
      footer: ltrHtml(PHONE_DISPLAY),
    }),
    text: layoutText(`${copy.supportHeading}\n\n${textFields}`, { footer: ltrText(locale, PHONE_DISPLAY) }),
  };
}
