// 26.2-bp A5 (owner decision 2026-09-30, question form): the confirmation prints the pickup
// time the way the pay-link and reminder mails do, not as raw ISO text.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { ConfirmationEmail, confirmationPlainText } from "./ConfirmationEmail";
import { formatPickup } from "./PayLinkEmail";
import type { BookingForEmail, EmailLocale } from "./lib/types";

function booking(locale: EmailLocale): BookingForEmail {
  return {
    reference: "VT-10001",
    contactName: "Greta",
    contactEmail: "greta@example.test",
    locale,
    displayCurrency: "CHF",
    totalRappen: null,
    manageUrl: "https://vamostaxi.site/en/manage?token=raw-token",
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText: "Zurich Airport (ZRH)",
        dropoffText: "Zurich, Bahnhofstrasse 1",
        scheduledLocal: "2026-09-22T19:55",
        scheduledAt: "2026-09-22T17:55:00.000Z",
        flightNo: "LX123",
        vehicleClassLabel: "Economy",
        pax: 2,
        bags: 1,
        estimatedDurationMinutes: 25,
      },
    ],
  };
}

describe("confirmation pickup time", () => {
  it.each(["en", "de", "fr", "ar"] as const)("%s: readable, same as the pay-link mail, no raw ISO", async (locale) => {
    const want = formatPickup("2026-09-22T19:55", locale);
    const html = await render(ConfirmationEmail({ booking: booking(locale) }));
    const text = confirmationPlainText(booking(locale));
    expect(text).toContain(want);
    expect(text).not.toContain("2026-09-22T19:55");
    expect(html).not.toContain("2026-09-22T19:55");
    expect(html).toContain("19:55");
  });

  it("en reads Tue, 22 Sept 2026 · 19:55", () => {
    expect(confirmationPlainText(booking("en"))).toContain("Tue, 22 Sept 2026 · 19:55");
  });
});
