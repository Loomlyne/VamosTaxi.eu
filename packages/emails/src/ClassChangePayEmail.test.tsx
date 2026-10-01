// packages/emails/src/ClassChangePayEmail.test.tsx
//
// 26.2 P1: the "pay the difference" e-mail of a class change. The owner approved the wording word
// for word in four languages (.planning/decisions/2026-10-01-class-change-pay-mail.md, question
// form, 2026-10-01). This test reads that file: with the decision's own example values
// (VT-26-0801, Business, and CHF 000 for each amount) every line must come out exactly as written.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import {
  ClassChangePayEmail,
  classChangePayCopy,
  classChangePayPlainText,
  classChangePaySubject,
} from "./ClassChangePayEmail";
import { coverage } from "./lib/t";
import type { ClassChangePayForEmail, EmailLocale } from "./lib/types";

const here = dirname(fileURLToPath(import.meta.url));
const DECISION = readFileSync(join(here, "../../../.planning/decisions/2026-10-01-class-change-pay-mail.md"), "utf8");

const SECTION: Record<EmailLocale, string> = { en: "English", de: "German", fr: "French", ar: "Arabic" };

function approved(locale: EmailLocale): { subject: string; heading: string; text: string; button: string } {
  const start = DECISION.indexOf(`## ${SECTION[locale]}`);
  expect(start).toBeGreaterThan(-1);
  const end = DECISION.indexOf("\n## ", start + 3);
  const block = DECISION.slice(start, end === -1 ? undefined : end);
  const line = (label: string) => {
    const m = block.match(new RegExp(`^- ${label}: (.+)$`, "m"));
    expect(m, `${locale} ${label}`).not.toBeNull();
    return m![1]!.trim();
  };
  return { subject: line("Subject"), heading: line("Heading"), text: line("Text"), button: line("Button") };
}

function mail(locale: EmailLocale, amounts: [number | null, number | null, number | null] = [null, null, null]): ClassChangePayForEmail {
  return {
    reference: "VT-26-0801",
    locale,
    className: "Business",
    newTotalRappen: amounts[0],
    paidRappen: amounts[1],
    differenceRappen: amounts[2],
    payUrl: "https://checkout.stripe.test/c/pay/cs_test_diff",
  };
}

const LOCALES: EmailLocale[] = ["en", "de", "fr", "ar"];

describe("class change pay mail: the owner's approved wording, word for word", () => {
  it.each(LOCALES)("%s subject, heading, text and button equal the decision file", (locale) => {
    const want = approved(locale);
    const copy = classChangePayCopy(mail(locale));
    expect(copy.subject).toBe(want.subject);
    expect(copy.heading).toBe(want.heading);
    expect(copy.text).toBe(want.text);
    expect(copy.button).toBe(want.button);
    expect(classChangePaySubject(mail(locale))).toBe(want.subject);
  });

  it("real amounts go in the order new total, paid so far, difference, through the money formatter", () => {
    const copy = classChangePayCopy(mail("en", [125_000, 100_000, 25_000]));
    expect(copy.text).toBe(
      "You asked to change booking VT-26-0801 to Business. The new total is CHF 1'250.00; you have paid CHF 1'000.00. Pay the difference of CHF 250.00 to confirm the change. The link works for 24 hours. If it is not paid by then, your booking stays as it is.",
    );
  });

  it.each(LOCALES)("%s renders the heading, the text, the button to the Stripe page and the language direction", async (locale) => {
    const html = await render(ClassChangePayEmail({ mail: mail(locale, [125_000, 100_000, 25_000]) }));
    const copy = classChangePayCopy(mail(locale, [125_000, 100_000, 25_000]));
    expect(html).toContain('href="https://checkout.stripe.test/c/pay/cs_test_diff"');
    expect(html).toContain(copy.button);
    expect(html).toContain(copy.heading);
    expect(html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
    // The amounts sit in left-to-right islands so CHF 1'250.00 never flips in Arabic.
    expect(html).toMatch(/direction:ltr[^>]*>CHF 1&#x27;250\.00</);
    const plain = classChangePayPlainText(mail(locale, [125_000, 100_000, 25_000]));
    expect(plain).toContain(copy.text);
    expect(plain).toContain("https://checkout.stripe.test/c/pay/cs_test_diff");
  });

  it("every key exists in de, fr and ar", () => {
    expect(coverage()).toEqual([]);
  });
});
