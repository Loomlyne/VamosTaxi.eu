// Entry bundled by emails.mjs: renders the real Arabic e-mails of packages/emails with sample data.
// No CHF amount is invented: the confirmation has no money block and a null total, so it shows its own "CHF 000".
import { render } from "@react-email/render";
import { ConfirmationEmail } from "../../../../packages/emails/src/ConfirmationEmail";
import { renderRefundEmail } from "../../../../packages/emails/src/refund";
import {
  renderContactCustomerEmail,
  renderContactSupportEmail,
  renderStaffReplyEmail,
} from "../../../../packages/emails/src/contact";
import { renderAuthEmail } from "../../../../packages/emails/src/auth";

export async function build(): Promise<Record<string, string>> {
  const booking = {
    reference: "VT-26-0807",
    contactName: "Amira Keller",
    contactEmail: "amira@example.com",
    locale: "ar" as const,
    displayCurrency: "CHF",
    totalRappen: null,
    manageUrl: "https://vamostaxi.site/ar/manage-booking?token=sample",
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText: "Zurich Airport (ZRH)",
        dropoffText: "Zermatt",
        scheduledLocal: "2026-10-07T08:15",
        scheduledAt: "2026-10-07T06:15:00.000Z",
        flightNo: null,
        vehicleClassLabel: "Van luxury",
        pax: 10,
        bags: 6,
        estimatedDurationMinutes: 210,
      },
    ],
  };
  return {
    confirmation: await render(ConfirmationEmail({ booking })),
    refund: renderRefundEmail("ar", "pending", { name: "Amira", reference: "VT-26-0807" }).html,
    "contact-customer": renderContactCustomerEmail("ar", { name: "Amira", message: "Can I add a child seat?" }).html,
    "contact-support": renderContactSupportEmail("ar", {
      name: "Amira Keller",
      email: "amira@example.com",
      phone: "",
      bookingRef: "VT-26-0807",
      message: "Can I add a child seat?",
    }).html,
    "contact-staff": renderStaffReplyEmail("ar", { reply: "Yes, we added it.", name: "Amira", bookingRef: "VT-26-0807" }).html,
    auth: renderAuthEmail("signup", "ar", { code: "", link: "https://vamostaxi.site/auth/confirm?t=sample", name: "Amira" }).html,
  };
}
