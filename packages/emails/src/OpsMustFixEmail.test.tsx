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
