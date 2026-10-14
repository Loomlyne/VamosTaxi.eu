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
   * What was refunded, in rappen (CHF): Phase 31 D-11, the Stripe refund's own amount. The "issued" mail names it.
   * Null, absent or not a positive whole number: the literal `{amount}` stays in the copy, so sendRefund answers
   * "missing-copy" and nothing is sent; never CHF 000, never an amount-free sentence the owner did not sign.
   */
  amountRappen?: number | null;
};

type Copy = {
  pendingSubject: string;
  pendingHeading: string;
  thanksNamed: string;
  thanksPlain: string;
  pendingRest: string;
  /** M1, and M2: the heading inside the mail repeats the subject words. */
  issuedSubject: string;
  /** M3 */
  issuedGreetingNamed: string;
  /** M4 */
  issuedGreetingPlain: string;
  /** M5 */
  issuedBody: string;
  /** M6 */
  issuedQuestions: string;
};

// "issued": the customer refund mail, signed by the owner on 2026-10-13 (~16:20 +04, Phase 31 S-06), used verbatim.
// Source of truth: .planning/decisions/2026-10-12-refund-mail-copy.md (M1..M6); refund.test.ts pins every string
// to it byte for byte. Swiss German "ss"; the German greeting has no comma, as signed.
// "pending" (J8, W6-17): builder wording, unchanged.
const COPY: Record<EmailLocale, Copy> = {
  en: {
    pendingSubject: "Refund in progress — Vamos Taxi",
    pendingHeading: "A refund is on the way",
    thanksNamed: "Thank you, {name}.",
    thanksPlain: "Thank you.",
    pendingRest: "A refund for {reference} will be issued to the card you paid with.",
    issuedSubject: "Your refund for {reference}",
    issuedGreetingNamed: "Hello {name},",
    issuedGreetingPlain: "Hello,",
    issuedBody:
      "We have sent {amount} back to the payment method you used for {reference}. Your bank may take a few days to show it.",
    issuedQuestions: "Questions? Write to us at info@vamostaxi.site.",
  },
  de: {
    pendingSubject: "Rückerstattung in Bearbeitung — Vamos Taxi",
    pendingHeading: "Eine Rückerstattung ist unterwegs",
    thanksNamed: "Danke, {name}.",
    thanksPlain: "Danke.",
    pendingRest: "Eine Rückerstattung für {reference} wird auf die Karte ausgezahlt, mit der Sie bezahlt haben.",
    issuedSubject: "Ihre Rückerstattung für {reference}",
    issuedGreetingNamed: "Guten Tag {name}",
    issuedGreetingPlain: "Guten Tag",
    issuedBody:
      "Wir haben {amount} an das Zahlungsmittel zurückerstattet, mit dem Sie {reference} bezahlt haben. Ihre Bank braucht vielleicht ein paar Tage, bis die Rückerstattung sichtbar ist.",
    issuedQuestions: "Fragen? Schreiben Sie uns an info@vamostaxi.site.",
  },
  fr: {
    pendingSubject: "Remboursement en cours — Vamos Taxi",
    pendingHeading: "Un remboursement est en cours",
    thanksNamed: "Merci, {name}.",
    thanksPlain: "Merci.",
    pendingRest: "Un remboursement pour {reference} sera versé sur la carte avec laquelle vous avez payé.",
    issuedSubject: "Votre remboursement pour {reference}",
    issuedGreetingNamed: "Bonjour {name},",
    issuedGreetingPlain: "Bonjour,",
    issuedBody:
      "Nous avons remboursé {amount} sur le moyen de paiement utilisé pour {reference}. Votre banque peut mettre quelques jours à l’afficher.",
    issuedQuestions: "Une question ? Écrivez-nous à info@vamostaxi.site.",
  },
  ar: {
    pendingSubject: "جاري استرداد المبلغ — Vamos Taxi",
    pendingHeading: "الاسترداد قيد التنفيذ",
    thanksNamed: "شكرًا، {name}.",
    thanksPlain: "شكرًا.",
    pendingRest: "سيتم إصدار استرداد لـ {reference} إلى البطاقة التي دفعت بها.",
    issuedSubject: "استرداد مبلغ حجزك {reference}",
    issuedGreetingNamed: "مرحبًا {name}،",
    issuedGreetingPlain: "مرحبًا،",
    issuedBody:
      "أعدنا {amount} إلى وسيلة الدفع التي استخدمتها في الحجز {reference}. قد يحتاج مصرفك بضعة أيام لإظهاره.",
    issuedQuestions: "لديك سؤال؟ راسلنا على info@vamostaxi.site.",
  },
};

// One pass with a function replacer: a name, reference or amount is never read as a `$&` pattern
// and is never searched again for another placeholder. A null amount leaves `{amount}` in place (the
// missing-copy sentinel sendRefund checks).
type FillValues = { name: string; reference: string; amount: string | null };

function fill(template: string, values: FillValues): string {
  return template.replace(/\{(name|reference|amount)\}/g, (match, key: "name" | "reference" | "amount") => {
    const value = values[key];
    return value === null ? match : value;
  });
}

/** A usable amount: a positive whole number of rappen. Anything else is "no amount" (never CHF 000 in a refund mail). */
function usableAmount(rappen: number | null | undefined): number | null {
  return typeof rappen === "number" && Number.isInteger(rappen) && rappen > 0 ? rappen : null;
}

function renderIssued(locale: EmailLocale, copy: Copy, data: RefundEmailData) {
  const name = data.name.trim();
  const reference = data.reference;
  const amountRappen = usableAmount(data.amountRappen);
  const amount = amountRappen === null ? null : formatPaidTotal(amountRappen);
  const rtl = locale === "ar";
  // Arabic: the amount and the reference keep their left-to-right order inside the sentence,
  // LRI…PDI in text, an LTR island in HTML.
  const textValues: FillValues = {
    name,
    reference: rtl ? `\u2066${reference}\u2069` : reference,
    amount: amount === null ? null : rtl ? `\u2066${amount}\u2069` : amount,
  };
  const htmlValues: FillValues = {
    name: escapeHtml(name),
    reference: rtl ? ltrHtml(reference) : escapeHtml(reference),
    amount: amount === null ? null : rtl ? ltrHtml(amount) : escapeHtml(amount),
  };
  const greeting = name ? copy.issuedGreetingNamed : copy.issuedGreetingPlain;
  // M2: the heading inside the mail is the subject words.
  const parts = [copy.issuedSubject, greeting, copy.issuedBody, copy.issuedQuestions];
  const [heading, ...paragraphs] = parts.map((part) => fill(escapeHtml(part), htmlValues));
  const inner = `<h1>${heading}</h1>${paragraphs.map((p) => `<p>${p}</p>`).join("")}`;
  const subject = fill(copy.issuedSubject, textValues);
  return {
    subject,
    html: layoutHtml(locale, inner, { footer: ltrHtml(PHONE_DISPLAY) }),
    text: layoutText(parts.map((part) => fill(part, textValues)).join("\n\n"), {
      footer: ltrText(locale, PHONE_DISPLAY),
    }),
  };
}

export function renderRefundEmail(locale: EmailLocale, kind: RefundKind, data: RefundEmailData) {
  const copy = COPY[locale] ?? COPY.en;
  if (kind === "issued") return renderIssued(locale, copy, data);
  const name = data.name.trim();
  const values: FillValues = { name, reference: data.reference, amount: null };
  const heading = copy.pendingHeading;
  const body = `${fill(name ? copy.thanksNamed : copy.thanksPlain, values)} ${fill(copy.pendingRest, values)}`;
  const inner = `<h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p>`;
  return {
    subject: copy.pendingSubject,
    // The phone reads left to right in Arabic: an LTR island in HTML, LRI…PDI in text (261002 F1).
    html: layoutHtml(locale, inner, { footer: ltrHtml(PHONE_DISPLAY) }),
    text: layoutText(`${heading}\n\n${body}`, { footer: ltrText(locale, PHONE_DISPLAY) }),
  };
}
