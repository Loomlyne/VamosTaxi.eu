// Phase 31 D-04 / D-08 / S-02: a paid cancel gets one refund line, the signed policy sentence (W3 of
// .planning/decisions/2026-10-12-refund-wording-signed.md), byte for byte, in en/de/fr/ar. No amount,
// never the word Stripe, never "our team". The "none" line is unchanged.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import {
  CancellationEmail,
  cancellationPlainText,
  type CancellationForEmail,
  type CancellationRefundLine,
} from "./CancellationEmail";
import type { EmailLocale } from "./lib/types";

const LOCALES: EmailLocale[] = ["en", "de", "fr", "ar"];
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const signed = readFileSync(join(root, ".planning/decisions/2026-10-12-refund-wording-signed.md"), "utf8");

/** The four-language rows under a "### Wn" heading of the signed wording file. */
function table(tag: string): Record<EmailLocale, string> {
  const start = signed.indexOf(`### ${tag} `);
  expect(start, `${tag} heading`).toBeGreaterThan(-1);
  const next = signed.indexOf("\n#", start + 4);
  const block = signed.slice(start, next === -1 ? undefined : next);
  const out: Partial<Record<EmailLocale, string>> = {};
  for (const lang of LOCALES) {
    const m = block.match(new RegExp(`^\\| ${lang} \\| (.+) \\|$`, "m"));
    expect(m, `${tag} ${lang}`).not.toBeNull();
    out[lang] = m![1];
  }
  return out as Record<EmailLocale, string>;
}

const W3 = table("W3");
const messages = (lang: EmailLocale) =>
  JSON.parse(readFileSync(join(here, "messages", `${lang}.json`), "utf8")) as {
    cancellation: Record<string, string | undefined>;
  };

function trip(locale: EmailLocale, refundLine: CancellationRefundLine): CancellationForEmail {
  return {
    reference: "VT-30001",
    locale,
    pickupText: "Zurich Airport (ZRH), Terminal 2",
    dropoffText: "Zurich, Bahnhofstrasse 1",
    scheduledLocal: "2026-09-22T19:55",
    refundLine,
  };
}

const PAID: CancellationRefundLine[] = ["full_captured", "pending_ops"];
const BANNED = ["Stripe", "CHF", "our team", "Our team"];

describe("CancellationEmail refund line (Phase 31 W3)", () => {
  for (const line of PAID) {
    it.each(LOCALES)(`${line} renders the signed policy sentence in %s (HTML and plain text)`, async (locale) => {
      const html = await render(CancellationEmail({ trip: trip(locale, line) }));
      expect(html).toContain(W3[locale]);
      expect(cancellationPlainText(trip(locale, line))).toContain(W3[locale]);
    });
  }

  it.each(LOCALES)("full_captured and pending_ops render the same text in %s", (locale) => {
    expect(cancellationPlainText(trip(locale, "full_captured"))).toBe(cancellationPlainText(trip(locale, "pending_ops")));
  });

  it("none still renders cancellation.refundNone", async () => {
    const html = await render(CancellationEmail({ trip: trip("en", "none") }));
    expect(html).toContain("No refund for this window.");
    expect(html).not.toContain(W3.en);
    for (const locale of LOCALES) {
      expect(cancellationPlainText(trip(locale, "none"))).toContain(messages(locale).cancellation.refundNone!);
    }
  });

  it("the policy sentence is not wrapped in a nowrap span (Arabic mail)", async () => {
    const html = await render(CancellationEmail({ trip: trip("ar", "full_captured") }));
    const at = html.indexOf(W3.ar);
    expect(at).toBeGreaterThan(-1);
    const openTag = html.slice(html.lastIndexOf("<", at), at);
    expect(openTag).not.toMatch(/nowrap/);
  });

  it("no rendered cancellation mail says Stripe, CHF or our team", async () => {
    for (const locale of LOCALES) {
      for (const line of [...PAID, "none"] as CancellationRefundLine[]) {
        const html = await render(CancellationEmail({ trip: trip(locale, line) }));
        const text = cancellationPlainText(trip(locale, line));
        for (const word of BANNED) {
          expect(html, `${locale} ${line} html "${word}"`).not.toContain(word);
          expect(text, `${locale} ${line} text "${word}"`).not.toContain(word);
        }
      }
    }
  });

  it.each(LOCALES)("messages/%s.json has cancellation.refundPolicy = W3 and no old refund keys", (locale) => {
    const c = messages(locale).cancellation;
    expect(c.refundPolicy).toBe(W3[locale]);
    expect(c.refundPendingOps).toBeUndefined();
    expect(c.refundFullCaptured).toBeUndefined();
  });
});
