import { escapeHtml } from "./escape";
import { layoutHtml, layoutText } from "./layout";
import type { EmailLocale } from "./messages";

export type ContactCustomerEmailData = { name: string };
export type ContactSupportEmailData = {
  name: string;
  email: string;
  phone: string;
  bookingRef: string;
  message: string;
};

type Copy = { customerSubject: string; customerHeading: string; customerBody: string; supportSubject: string; supportHeading: string };

const COPY: Record<EmailLocale, Copy> = {
  en: {
    customerSubject: "We received your message — Vamos Taxi",
    customerHeading: "Message received",
    customerBody: "Thank you, {name}. Our team will review your message.",
    supportSubject: "New contact message — Vamos Taxi",
    supportHeading: "New contact message",
  },
  de: {
    customerSubject: "Wir haben Ihre Nachricht erhalten — Vamos Taxi",
    customerHeading: "Nachricht erhalten",
    customerBody: "Danke, {name}. Unser Team prüft Ihre Nachricht.",
    supportSubject: "Neue Kontaktanfrage — Vamos Taxi",
    supportHeading: "Neue Kontaktanfrage",
  },
  fr: {
    customerSubject: "Nous avons reçu votre message — Vamos Taxi",
    customerHeading: "Message reçu",
    customerBody: "Merci, {name}. Notre équipe examinera votre message.",
    supportSubject: "Nouveau message de contact — Vamos Taxi",
    supportHeading: "Nouveau message de contact",
  },
  ar: {
    customerSubject: "تلقينا رسالتك — Vamos Taxi",
    customerHeading: "تم استلام الرسالة",
    customerBody: "شكرًا، {name}. سيقوم فريقنا بمراجعة رسالتك.",
    supportSubject: "رسالة تواصل جديدة — Vamos Taxi",
    supportHeading: "رسالة تواصل جديدة",
  },
};

const CONTACT_FOOTER = "+41 79 626 70 82";

function rendered(locale: EmailLocale, subject: string, inner: string, text: string) {
  return {
    subject,
    html: layoutHtml(locale, inner, { footer: CONTACT_FOOTER }),
    text: layoutText(text, { footer: CONTACT_FOOTER }),
  };
}

export function renderContactCustomerEmail(locale: EmailLocale, data: ContactCustomerEmailData) {
  const copy = COPY[locale];
  const name = data.name.trim();
  const body = copy.customerBody.replace("{name}", name);
  return rendered(
    locale,
    copy.customerSubject,
    `<p style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:700;">${escapeHtml(copy.customerHeading)}</p><p style="margin:0;">${escapeHtml(body)}</p>`,
    `${copy.customerHeading}\n\n${body}`,
  );
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
  return rendered(
    locale,
    copy.supportSubject,
    `<p style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;">${escapeHtml(copy.supportHeading)}</p>${htmlFields}`,
    `${copy.supportHeading}\n\n${textFields}`,
  );
}
