import { escapeHtml } from "./escape";
import { formatPaidTotal } from "./ConfirmationEmail";
import { layoutHtml, layoutText, ltrHtml, ltrText, PHONE_DISPLAY } from "./layout";
import type { EmailLocale } from "./messages";

export type RefundKind = "pending" | "issued";

export type RefundEmailData = {
  /** The booker's name. Blank is allowed: the mail then thanks without a name (J8, W6-17: no English fallback word). */
  name: string;
  reference: string;
  /**
   * J8 (W6-17): what was refunded, in rappen (CHF). The "issued" mail names it, so a part refund does not read like a
   * full one. Null or absent: the sentence without an amount, never an invented figure.
   */
  amountRappen?: number | null;
};

type Copy = {
  pendingSubject: string;
  pendingHeading: string;
  issuedSubject: string;
  issuedHeading: string;
  thanksNamed: string;
  thanksPlain: string;
  pendingRest: string;
  issuedRest: string;
  issuedRestAmount: string;
};

// J8 (W6-17): "card you paid with", not "bank account" (every payment is a card payment), a thanks line that works
// without a name, and the refunded amount. Wording written by the builder for the owner to read before it ships.
const COPY: Record<EmailLocale, Copy> = {
  en: {
    pendingSubject: "Refund in progress — Vamos Taxi",
    pendingHeading: "A refund is on the way",
    issuedSubject: "Refund issued — Vamos Taxi",
    issuedHeading: "Refund issued",
    thanksNamed: "Thank you, {name}.",
    thanksPlain: "Thank you.",
    pendingRest: "A refund for {reference} will be issued to the card you paid with.",
    issuedRest: "The refund for {reference} has been issued to the card you paid with.",
    issuedRestAmount: "The refund of {amount} for {reference} has been issued to the card you paid with.",
  },
  de: {
    pendingSubject: "Rückerstattung in Bearbeitung — Vamos Taxi",
    pendingHeading: "Eine Rückerstattung ist unterwegs",
    issuedSubject: "Rückerstattung ausgezahlt — Vamos Taxi",
    issuedHeading: "Rückerstattung ausgezahlt",
    thanksNamed: "Danke, {name}.",
    thanksPlain: "Danke.",
    pendingRest: "Eine Rückerstattung für {reference} wird auf die Karte ausgezahlt, mit der Sie bezahlt haben.",
    issuedRest: "Die Rückerstattung für {reference} wurde auf die Karte ausgezahlt, mit der Sie bezahlt haben.",
    issuedRestAmount:
      "Die Rückerstattung von {amount} für {reference} wurde auf die Karte ausgezahlt, mit der Sie bezahlt haben.",
  },
  fr: {
    pendingSubject: "Remboursement en cours — Vamos Taxi",
    pendingHeading: "Un remboursement est en cours",
    issuedSubject: "Remboursement versé — Vamos Taxi",
    issuedHeading: "Remboursement versé",
    thanksNamed: "Merci, {name}.",
    thanksPlain: "Merci.",
    pendingRest: "Un remboursement pour {reference} sera versé sur la carte avec laquelle vous avez payé.",
    issuedRest: "Le remboursement pour {reference} a été versé sur la carte avec laquelle vous avez payé.",
    issuedRestAmount:
      "Le remboursement de {amount} pour {reference} a été versé sur la carte avec laquelle vous avez payé.",
  },
  ar: {
    pendingSubject: "جاري استرداد المبلغ — Vamos Taxi",
    pendingHeading: "الاسترداد قيد التنفيذ",
    issuedSubject: "تم إصدار الاسترداد — Vamos Taxi",
    issuedHeading: "تم إصدار الاسترداد",
    thanksNamed: "شكرًا، {name}.",
    thanksPlain: "شكرًا.",
    pendingRest: "سيتم إصدار استرداد لـ {reference} إلى البطاقة التي دفعت بها.",
    issuedRest: "تم إصدار استرداد {reference} إلى البطاقة التي دفعت بها.",
    issuedRestAmount: "تم إصدار استرداد بمبلغ {amount} لـ {reference} إلى البطاقة التي دفعت بها.",
  },
};

// One pass with a function replacer: a name, reference or amount is never read as a `$&` pattern
// and is never searched again for another placeholder.
function fill(template: string, values: { name: string; reference: string; amount: string }): string {
  return template.replace(
    /\{(name|reference|amount)\}/g,
    (_match, key: "name" | "reference" | "amount") => values[key],
  );
}

/** A usable amount: a positive whole number of rappen. Anything else is "no amount" (never CHF 000 in a refund mail). */
function usableAmount(rappen: number | null | undefined): number | null {
  return typeof rappen === "number" && Number.isInteger(rappen) && rappen > 0 ? rappen : null;
}

export function renderRefundEmail(locale: EmailLocale, kind: RefundKind, data: RefundEmailData) {
  const copy = COPY[locale] ?? COPY.en;
  const name = data.name.trim();
  const amountRappen = kind === "issued" ? usableAmount(data.amountRappen) : null;
  // In Arabic text an LTR amount is isolated so "CHF 12.00" keeps its order inside the sentence.
  const amount = amountRappen === null ? "" : locale === "ar" ? `\u2066${formatPaidTotal(amountRappen)}\u2069` : formatPaidTotal(amountRappen);
  const heading = kind === "issued" ? copy.issuedHeading : copy.pendingHeading;
  const rest =
    kind === "issued" ? (amountRappen === null ? copy.issuedRest : copy.issuedRestAmount) : copy.pendingRest;
  const body = `${fill(name ? copy.thanksNamed : copy.thanksPlain, { name, reference: data.reference, amount })} ${fill(rest, { name, reference: data.reference, amount })}`;
  const subject = kind === "issued" ? copy.issuedSubject : copy.pendingSubject;
  const inner = `<h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p>`;
  return {
    subject,
    // The phone reads left to right in Arabic: an LTR island in HTML, LRI…PDI in text (261002 F1).
    html: layoutHtml(locale, inner, { footer: ltrHtml(PHONE_DISPLAY) }),
    text: layoutText(`${heading}\n\n${body}`, { footer: ltrText(locale, PHONE_DISPLAY) }),
  };
}
