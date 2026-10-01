// packages/emails/src/TripChangePayEmail.test.tsx
//
// 26.2 P6: the "pay the difference" e-mail of a place or time change (not a class change alone).
// The owner approved the wording word for word in four languages (D14,
// .planning/decisions/2026-10-01-p6-paid-trip-edit.md). This test reads that file: with its own
// example (VT-26-0801, a new pickup "Zug station, Bahnhofplatz, 6300 Zug", CHF 000 for each amount)
// subject, heading, text and button come out exactly as written; one sentence per changed field in
// the order New pickup, New destination, New pickup time, New class.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { formatPickup } from "./lib/pickup-time";
import { coverage } from "./lib/t";
import type { EmailLocale } from "./lib/types";
import {
  TripChangePayEmail,
  tripChangePayCopy,
  tripChangePayPlainText,
  tripChangePaySubject,
  type TripChangePayForEmail,
} from "./TripChangePayEmail";

const here = dirname(fileURLToPath(import.meta.url));
const DECISION = readFileSync(join(here, "../../../.planning/decisions/2026-10-01-p6-paid-trip-edit.md"), "utf8");
const D14 = DECISION.slice(DECISION.indexOf("### D14"), DECISION.indexOf("### D15"));
const TITLE: Record<EmailLocale, string> = { en: "English", de: "German", fr: "French", ar: "Arabic" };
const LOCALES: EmailLocale[] = ["en", "de", "fr", "ar"];
const ZUG = "Zug station, Bahnhofplatz, 6300 Zug";

function approved(locale: EmailLocale) {
  const start = D14.indexOf(`**${TITLE[locale]}**`);
  expect(start).toBeGreaterThan(-1);
  const next = D14.indexOf("\n**", start + 3);
  const block = D14.slice(start, next === -1 ? undefined : next);
  const line = (label: string) => {
    const m = block.match(new RegExp(`^- ${label}: (.+)$`, "m"));
    expect(m, `${locale} ${label}`).not.toBeNull();
    return m![1]!.trim();
  };
  return { subject: line("Subject"), heading: line("Heading"), text: line("Text"), button: line("Button"), lines: line("Lines").split(" / ") };
}

function mail(locale: EmailLocale, changes: TripChangePayForEmail["changes"] = { pickup: ZUG }, amounts: [number | null, number | null, number | null] = [null, null, null]): TripChangePayForEmail {
  return {
    reference: "VT-26-0801",
    locale,
    changes,
    newTotalRappen: amounts[0],
    paidRappen: amounts[1],
    differenceRappen: amounts[2],
    payUrl: "https://checkout.stripe.test/c/pay/cs_test_trip",
  };
}

describe("trip change pay mail: the owner's approved wording (D14), word for word", () => {
  it.each(LOCALES)("%s subject, heading, text and button equal the decision file", (locale) => {
    const want = approved(locale);
    const copy = tripChangePayCopy(mail(locale));
    expect(copy.subject).toBe(want.subject);
    expect(copy.heading).toBe(want.heading);
    expect(copy.text).toBe(want.text);
    expect(copy.button).toBe(want.button);
    expect(tripChangePaySubject(mail(locale))).toBe(want.subject);
  });

  it.each(LOCALES)("%s: one sentence per changed field, in the approved order and form", (locale) => {
    const want = approved(locale);
    const copy = tripChangePayCopy(
      mail(locale, { className: "Business", scheduledLocal: "2026-10-08T10:00", dropoff: "Zurich Airport", pickup: ZUG }),
    );
    const sentences = [
      want.lines[0]!.replace("…", ZUG),
      want.lines[1]!.replace("…", "Zurich Airport"),
      want.lines[2]!.replace("…", formatPickup("2026-10-08T10:00", locale)),
      want.lines[3]!.replace("…", "Business"),
    ].map((s) => `${s}.`);
    const at = sentences.map((s) => copy.text.indexOf(s));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // The text around the sentences is the approved text around its one example sentence.
    const example = `${want.lines[0]!.replace("…", ZUG)}.`;
    expect(copy.text).toBe(want.text.replace(example, sentences.join(" ")));
  });

  it("real amounts go in the order new total, paid so far, difference, through the money formatter", () => {
    const copy = tripChangePayCopy(mail("en", { dropoff: "Zug" }, [125_000, 100_000, 25_000]));
    expect(copy.text).toBe(
      "You asked to change booking VT-26-0801. New destination: Zug. The new total is CHF 1'250.00; you have paid CHF 1'000.00. Pay the difference of CHF 250.00 to confirm the change. The link works for 24 hours. If it is not paid by then, your booking stays as it is.",
    );
  });

  it.each(LOCALES)("%s renders heading, text, the button to the Stripe page and the language direction", async (locale) => {
    const m = mail(locale, { pickup: ZUG, className: "Business" }, [125_000, 100_000, 25_000]);
    const html = await render(TripChangePayEmail({ mail: m }));
    const copy = tripChangePayCopy(m);
    expect(html).toContain('href="https://checkout.stripe.test/c/pay/cs_test_trip"');
    expect(html).toContain(copy.button);
    expect(html).toContain(copy.heading);
    expect(html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
    // Amounts and the place sit in left-to-right islands (they never flip in Arabic).
    expect(html).toMatch(/direction:ltr[^>]*>CHF 1&#x27;250\.00</);
    expect(html).toMatch(/direction:ltr[^>]*>Zug station, Bahnhofplatz, 6300 Zug</);
    const plain = tripChangePayPlainText(m);
    expect(plain).toContain(copy.text);
    expect(plain).toContain("https://checkout.stripe.test/c/pay/cs_test_trip");
  });

  it("every key exists in de, fr and ar", () => {
    expect(coverage()).toEqual([]);
  });
});
