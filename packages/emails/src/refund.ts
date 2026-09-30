import { escapeHtml } from "./escape";
import { layoutHtml, layoutText } from "./layout";
import type { EmailLocale } from "./messages";

export type RefundKind = "pending" | "issued";

export type RefundEmailData = {
  name: string;
  reference: string;
};

type Copy = {
  pendingSubject: string;
  pendingHeading: string;
  pendingBody: string;
  issuedSubject: string;
  issuedHeading: string;
  issuedBody: string;
};

const COPY: Record<EmailLocale, Copy> = {
  en: {
    pendingSubject: "Refund in progress — Vamos Taxi",
    pendingHeading: "A refund is on the way",
    pendingBody:
      "Thank you, {name}. A refund for {reference} will be issued to the bank account used for this booking.",
    issuedSubject: "Refund issued — Vamos Taxi",
    issuedHeading: "Refund issued",
    issuedBody:
      "Thank you, {name}. The refund for {reference} has been issued to the bank account used for this booking.",
  },
  de: {
    pendingSubject: "Rückerstattung in Bearbeitung — Vamos Taxi",
    pendingHeading: "Eine Rückerstattung ist unterwegs",
    pendingBody:
      "Danke, {name}. Eine Rückerstattung für {reference} wird auf das für diese Buchung verwendete Bankkonto ausgezahlt.",
    issuedSubject: "Rückerstattung ausgezahlt — Vamos Taxi",
    issuedHeading: "Rückerstattung ausgezahlt",
    issuedBody:
      "Danke, {name}. Die Rückerstattung für {reference} wurde auf das für diese Buchung verwendete Bankkonto ausgezahlt.",
  },
  fr: {
    pendingSubject: "Remboursement en cours — Vamos Taxi",
    pendingHeading: "Un remboursement est en cours",
    pendingBody:
      "Merci, {name}. Un remboursement pour {reference} sera versé sur le compte bancaire utilisé pour cette réservation.",
    issuedSubject: "Remboursement versé — Vamos Taxi",
    issuedHeading: "Remboursement versé",
    issuedBody:
      "Merci, {name}. Le remboursement pour {reference} a été versé sur le compte bancaire utilisé pour cette réservation.",
  },
  ar: {
    pendingSubject: "جاري استرداد المبلغ — Vamos Taxi",
    pendingHeading: "الاسترداد قيد التنفيذ",
    pendingBody:
      "شكرًا، {name}. سيتم إصدار استرداد لـ {reference} إلى الحساب المصرفي المستخدم لهذا الحجز.",
    issuedSubject: "تم إصدار الاسترداد — Vamos Taxi",
    issuedHeading: "تم إصدار الاسترداد",
    issuedBody:
      "شكرًا، {name}. تم إصدار استرداد {reference} إلى الحساب المصرفي المستخدم لهذا الحجز.",
  },
};

const FOOTER = "+41 79 626 70 82";

// One pass with a function replacer: a name or reference is never read as a `$&` pattern
// and is never searched again for the other placeholder.
function fill(template: string, data: RefundEmailData): string {
  return template.replace(/\{(name|reference)\}/g, (_match, key: "name" | "reference") => data[key]);
}

export function renderRefundEmail(locale: EmailLocale, kind: RefundKind, data: RefundEmailData) {
  const copy = COPY[locale] ?? COPY.en;
  const heading = kind === "issued" ? copy.issuedHeading : copy.pendingHeading;
  const body = fill(kind === "issued" ? copy.issuedBody : copy.pendingBody, data);
  const subject = kind === "issued" ? copy.issuedSubject : copy.pendingSubject;
  const inner = `<h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p>`;
  return {
    subject,
    html: layoutHtml(locale, inner, { footer: FOOTER }),
    text: layoutText(`${heading}\n\n${body}`, { footer: FOOTER }),
  };
}
