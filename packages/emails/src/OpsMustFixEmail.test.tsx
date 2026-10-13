import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import {
  OpsMustFixEmail,
  opsMustFixPlainText,
  opsMustFixSubject,
  type OpsMustFixForEmail,
} from "./OpsMustFixEmail";
import type { EmailLocale } from "./lib/types";

const LOCALES: EmailLocale[] = ["en", "de", "fr", "ar"];

/** The four-language rows under a "### Wn" heading of the signed Phase 31 wording file. */
function signedTable(tag: string): Record<EmailLocale, string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../../../.planning/decisions/2026-10-12-refund-wording-signed.md"), "utf8");
  const start = src.indexOf(`### ${tag} `);
  expect(start, `${tag} heading`).toBeGreaterThan(-1);
  const next = src.indexOf("\n#", start + 4);
  const block = src.slice(start, next === -1 ? undefined : next);
  const out: Partial<Record<EmailLocale, string>> = {};
  for (const lang of LOCALES) {
    const m = block.match(new RegExp(`^\\| ${lang} \\| (.+) \\|$`, "m"));
    expect(m, `${tag} ${lang}`).not.toBeNull();
    out[lang] = m![1];
  }
  return out as Record<EmailLocale, string>;
}

function payload(locale: EmailLocale, kind: OpsMustFixForEmail["kind"] = "off-road"): OpsMustFixForEmail {
  return {
    locale,
    kind,
    trips: [
      {
        reference: "VT-10001",
        pickupText: "Zurich Airport (ZRH), Terminal 2",
        dropoffText: "Zurich, Bahnhofstrasse 1",
        scheduledLocal: "2026-09-22T19:55",
      },
    ],
  };
}

describe("OpsMustFixEmail", () => {
  it.each(LOCALES)("renders %s off-road without auto-cancel or invented fare", async (locale) => {
    const html = await render(OpsMustFixEmail({ payload: payload(locale, "off-road") }));
    expect(html).not.toMatch(/\{[a-zA-Z.]+\}/);
    expect(html).toContain("VT-10001");
    expect(html).toContain("Zurich Airport (ZRH), Terminal 2");
    expect(html).toContain("Zurich, Bahnhofstrasse 1");
    expect(html).toContain("wordmark-email.png");
    expect(html).toContain("#FDC20B");
    expect(html).not.toContain("sk_test");
    expect(html).not.toContain("CHF");
    expect(html.toLowerCase()).not.toContain("whatsapp");
    expect(html.toLowerCase()).not.toContain("app store");
    expect(html.toLowerCase()).not.toContain("play store");
    expect(html).not.toMatch(/auto-?cancel/i);
    expect(html.toLowerCase()).not.toContain("cancelled automatically");
    expect(html.toLowerCase()).not.toContain("storniert automatisch");
  });

  it.each(LOCALES)("renders %s overlap without auto-cancel", async (locale) => {
    const html = await render(OpsMustFixEmail({ payload: payload(locale, "overlap") }));
    expect(html).toContain("VT-10001");
    expect(html).not.toContain("sk_test");
    expect(html).not.toContain("CHF");
    expect(html).not.toMatch(/auto-?cancel/i);
  });

  it("plain text and subject carry the reference", () => {
    const offRoad = payload("en", "off-road");
    expect(opsMustFixSubject(offRoad)).toContain("VT-10001");
    expect(opsMustFixPlainText(offRoad)).toContain("Bahnhofstrasse 1");
    expect(opsMustFixPlainText(offRoad).toLowerCase()).not.toContain("whatsapp");
    const overlap = payload("de", "overlap");
    expect(opsMustFixSubject(overlap)).toContain("VT-10001");
    expect(opsMustFixPlainText(overlap)).toContain("VT-10001");
  });
});

describe("OpsMustFixEmail stuck-payment (D-06)", () => {
  function stuckPayload(
    locale: EmailLocale,
    reference: string | null = "VT-10001",
  ): OpsMustFixForEmail {
    return {
      locale,
      kind: "stuck-payment",
      trips: reference
        ? [{ reference, pickupText: "", dropoffText: "", scheduledLocal: "" }]
        : [],
      detail: {
        eventId: "evt_stuck_1",
        eventType: "checkout.session.completed",
        objectId: "cs_test_stuck_1",
      },
    };
  }

  it.each(LOCALES)("renders %s with event id, type, object id and no customer PII", async (locale) => {
    const html = await render(OpsMustFixEmail({ payload: stuckPayload(locale) }));
    expect(html).toContain("VT-10001");
    expect(html).toContain("evt_stuck_1");
    expect(html).toContain("checkout.session.completed");
    expect(html).toContain("cs_test_stuck_1");
    expect(html).not.toContain("a@b.c");
    expect(html).not.toMatch(/contactEmail|contactName|customer@/i);
    expect(html).not.toContain("CHF");
    expect(html).not.toContain("sk_test");
  });

  it("renders with no reference at all — the alert must still send with no trip row", async () => {
    const html = await render(OpsMustFixEmail({ payload: stuckPayload("en", null) }));
    expect(html).toContain("evt_stuck_1");
    expect(html).toContain("cs_test_stuck_1");
    expect(html).not.toContain("VT-10001");
  });

  it("plain text and subject carry the event detail", () => {
    const p = stuckPayload("en");
    expect(opsMustFixPlainText(p)).toContain("evt_stuck_1");
    expect(opsMustFixSubject(p)).toContain("VT-10001");
  });
});

describe("OpsMustFixEmail paid-after-cancel", () => {
  function paidAfterCancelPayload(locale: EmailLocale): OpsMustFixForEmail {
    return {
      locale,
      kind: "paid-after-cancel",
      trips: [{ reference: "VT-20002", pickupText: "", dropoffText: "", scheduledLocal: "" }],
    };
  }

  it.each(LOCALES)("renders %s with the reference and an automatic-refund sentence", async (locale) => {
    const html = await render(OpsMustFixEmail({ payload: paidAfterCancelPayload(locale) }));
    expect(html).toContain("VT-20002");
    expect(html).not.toContain("CHF");
  });
});

// 261002 settle safety: T1 signed 2026-10-02; action sentence changed by Phase 31 D-08, 2026-10-12
// (accepted by the owner 2026-10-13, S-09). Word for word; W4 of 2026-10-12-refund-wording-signed.md.
describe("OpsMustFixEmail difference-not-applied (T1)", () => {
  const T1: Record<EmailLocale, { headline: string; body: string }> = {
    en: {
      headline: "Difference paid, change not applied",
      body: "The customer paid the difference for this booking, but the change was not applied: the trip was cancelled, a newer change replaced it, or it no longer fits. The payment is recorded. Refund it in Stripe, or make the change again.",
    },
    de: {
      headline: "Differenz bezahlt, Änderung nicht übernommen",
      body: "Der Kunde hat die Differenz für diese Buchung bezahlt, aber die Änderung wurde nicht übernommen: Die Fahrt wurde storniert, eine neuere Änderung hat sie ersetzt, oder sie passt nicht mehr. Die Zahlung ist verbucht. Erstatten Sie sie in Stripe oder nehmen Sie die Änderung erneut vor.",
    },
    fr: {
      headline: "Différence payée, modification non appliquée",
      body: "Le client a payé la différence pour cette réservation, mais la modification n’a pas été appliquée : le trajet a été annulé, une modification plus récente l’a remplacée, ou elle ne convient plus. Le paiement est enregistré. Remboursez-le dans Stripe ou refaites la modification.",
    },
    ar: {
      headline: "دُفع الفرق ولم يُطبَّق التغيير",
      body: "دفع العميل الفرق لهذا الحجز، لكن التغيير لم يُطبَّق: أُلغيت الرحلة، أو حلّ محله تغيير أحدث، أو لم يعد مناسبًا. الدفعة مسجّلة. نفّذ الاسترداد في Stripe، أو أجرِ التغيير مرة أخرى.",
    },
  };

  function differencePayload(locale: EmailLocale): OpsMustFixForEmail {
    return {
      locale,
      kind: "difference-not-applied",
      trips: [{ reference: "VT-30003", pickupText: "", dropoffText: "", scheduledLocal: "" }],
    };
  }

  // react-email escapes quotes and the like in the HTML; compare the text through the plain-text twin.
  it.each(LOCALES)("%s: plain text carries the signed headline and body and the reference", (locale) => {
    const text = opsMustFixPlainText(differencePayload(locale));
    expect(text).toContain(T1[locale].headline);
    expect(text).toContain(T1[locale].body);
    expect(text).toContain("VT-30003");
  });

  it.each(LOCALES)("%s: the rendered mail shows the headline, no raw key, no CHF", async (locale) => {
    const html = await render(OpsMustFixEmail({ payload: differencePayload(locale) }));
    expect(html).toContain(T1[locale].headline);
    expect(html).toContain("VT-30003");
    expect(html).not.toMatch(/\{opsMustFix\./);
    expect(html).not.toContain("CHF");
  });

  it("en renders the whole signed body in the HTML", async () => {
    const html = await render(OpsMustFixEmail({ payload: differencePayload("en") }));
    expect(html).toContain(T1.en.body);
  });

  it("subject carries the reference", () => {
    expect(opsMustFixSubject(differencePayload("de"))).toContain("VT-30003");
  });

  const OLD_ACTION: Record<EmailLocale, string> = {
    en: "Send it back from the dashboard",
    de: "Senden Sie sie im Dashboard zurück",
    fr: "Renvoyez-le depuis le tableau de bord",
    ar: "أعِدها من لوحة التحكم",
  };

  it.each(LOCALES)("%s: the old dashboard action sentence is gone", (locale) => {
    expect(opsMustFixPlainText(differencePayload(locale))).not.toContain(OLD_ACTION[locale]);
  });

  it.each(LOCALES)("%s: the body is W4 of the signed wording file", (locale) => {
    expect(signedTable("W4")[locale]).toBe(T1[locale].body);
  });
});

// Phase 31 D-08 / R31-09 (accepted 2026-10-13, S-09): the refund-failed must-fix mail points to Stripe.
// W5 of 2026-10-12-refund-wording-signed.md. refundFailed.body (the other mail) is unchanged.
describe("OpsMustFixEmail refund-failed body (Phase 31 W5)", () => {
  const BODY: Record<EmailLocale, string> = {
    en: "Stripe reported a refund as failed after it was recorded. Open the payment in Stripe to try again.",
    de: "Stripe hat eine bereits verbuchte Rückerstattung als fehlgeschlagen gemeldet. Öffnen Sie die Zahlung in Stripe, um es erneut zu versuchen.",
    fr: "Stripe a signalé comme échoué un remboursement déjà enregistré. Ouvrez le paiement dans Stripe pour réessayer.",
    ar: "أبلغت Stripe عن فشل استرداد سبق تسجيله. افتح الدفعة في Stripe لإعادة المحاولة.",
  };
  const OLD_ACTION: Record<EmailLocale, string> = {
    en: "send the refund again",
    de: "senden Sie die Rückerstattung erneut",
    fr: "renvoyez le remboursement",
    ar: "أعد إرسال الاسترداد",
  };
  function failedPayload(locale: EmailLocale): OpsMustFixForEmail {
    return {
      locale,
      kind: "refund-failed",
      trips: [{ reference: "VT-40005", pickupText: "", dropoffText: "", scheduledLocal: "" }],
      detail: { eventId: "evt_rf_1", eventType: "refund.failed", objectId: "re_rf_1" },
    };
  }

  it.each(LOCALES)("%s: plain text carries the new body and not the old action", (locale) => {
    const text = opsMustFixPlainText(failedPayload(locale));
    expect(text).toContain(BODY[locale]);
    expect(text).not.toContain(OLD_ACTION[locale]);
    expect(text).not.toContain("dashboard");
  });

  it.each(LOCALES)("%s: the body is W5 of the signed wording file", (locale) => {
    expect(signedTable("W5")[locale]).toBe(BODY[locale]);
  });

  it("refundFailed.body stays 'The trip stays cancelled. Retry the refund in Stripe.'", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const en = JSON.parse(readFileSync(join(here, "messages/en.json"), "utf8")) as { refundFailed: { body: string } };
    expect(en.refundFailed.body).toBe("The trip stays cancelled. Retry the refund in Stripe.");
  });
});

describe("OpsMustFixEmail amount-mismatch (J3, W4-07)", () => {
  const HEADLINE: Record<EmailLocale, string> = {
    en: "Payment held: the amount does not match",
    de: "Zahlung zurückgehalten: Betrag stimmt nicht",
    fr: "Paiement retenu : le montant ne correspond pas",
    ar: "دفعة معلّقة: المبلغ لا يطابق",
  };
  function mismatchPayload(locale: EmailLocale): OpsMustFixForEmail {
    return {
      locale,
      kind: "amount-mismatch",
      trips: [{ reference: "VT-30004", pickupText: "", dropoffText: "", scheduledLocal: "" }],
      detail: { eventId: "evt_mm_1", eventType: "checkout.session.completed", objectId: "cs_test_mm_1" },
    };
  }

  it.each(LOCALES)("%s: headline and body are translated, the ids are shown, no raw key, no customer data, no amount", async (locale) => {
    const html = await render(OpsMustFixEmail({ payload: mismatchPayload(locale) }));
    expect(html).toContain(HEADLINE[locale]);
    expect(html).toContain("VT-30004");
    expect(html).toContain("evt_mm_1");
    expect(html).toContain("cs_test_mm_1");
    expect(html).not.toMatch(/opsMustFix\./);
    expect(html).not.toContain("CHF");
    expect(html).not.toMatch(/@/);
    expect(opsMustFixPlainText(mismatchPayload(locale))).toContain(HEADLINE[locale]);
  });

  it("the four bodies are different texts (no copied English)", () => {
    const bodies = LOCALES.map((l) => opsMustFixPlainText(mismatchPayload(l)).split("\n")[1]);
    expect(new Set(bodies).size).toBe(LOCALES.length);
  });

  it("the subject carries the reference", () => {
    expect(opsMustFixSubject(mismatchPayload("fr"))).toContain("VT-30004");
  });
});

// J7 (W6-05, W6-07): the two money alerts. Ids only: the booking reference, the Stripe event id and type, the
// refund or dispute id. No name, e-mail, card or amount.
describe("OpsMustFixEmail refund-failed and dispute (J7)", () => {
  const WORDS: Record<"refund-failed" | "dispute", Record<EmailLocale, string>> = {
    "refund-failed": {
      en: "A refund was reversed by Stripe",
      de: "Eine Rückerstattung wurde von Stripe rückgängig gemacht",
      fr: "Un remboursement a été annulé par Stripe",
      ar: "ألغت Stripe عملية استرداد",
    },
    dispute: {
      en: "A card dispute was opened or changed",
      de: "Eine Kartenstreitigkeit wurde eröffnet oder geändert",
      fr: "Un litige de carte a été ouvert ou modifié",
      ar: "فُتح نزاع على بطاقة أو تغيّرت حالته",
    },
  };

  function alertPayload(locale: EmailLocale, kind: "refund-failed" | "dispute"): OpsMustFixForEmail {
    return {
      locale,
      kind,
      trips: [{ reference: "VT-40004", pickupText: "", dropoffText: "", scheduledLocal: "" }],
      detail: {
        eventId: "evt_money_1",
        eventType: kind === "dispute" ? "charge.dispute.created" : "refund.failed",
        objectId: kind === "dispute" ? "du_money_1" : "re_money_1",
      },
    };
  }

  for (const kind of ["refund-failed", "dispute"] as const) {
    it.each(LOCALES)(`${kind}: %s plain text carries the headline, the reference and the three ids, no raw key`, (locale) => {
      const text = opsMustFixPlainText(alertPayload(locale, kind));
      expect(text).toContain(WORDS[kind][locale]);
      expect(text).toContain("VT-40004");
      expect(text).toContain("evt_money_1");
      expect(text).not.toMatch(/opsMustFix\./);
    });

    it.each(LOCALES)(`${kind}: %s rendered mail has the ids and no customer data or amount`, async (locale) => {
      const html = await render(OpsMustFixEmail({ payload: alertPayload(locale, kind) }));
      expect(html).toContain("VT-40004");
      expect(html).toContain(kind === "dispute" ? "du_money_1" : "re_money_1");
      expect(html).not.toContain("CHF");
      expect(html).not.toMatch(/contactEmail|contactName|customer@/i);
    });
  }
});

describe("send envelope", () => {
  it("uses noreply@vamostaxi.site and sendOpsMustFix", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const send = readFileSync(join(here, "lib/send.ts"), "utf8");
    expect(send).toContain("Vamos Taxi <noreply@vamostaxi.site>");
    expect(send).toContain("sendOpsMustFix");
    const fn = send.slice(send.indexOf("export async function sendOpsMustFix"));
    expect(fn).not.toContain("notification_claim");
    expect(fn.toLowerCase()).not.toContain("gmail");
  });
});
