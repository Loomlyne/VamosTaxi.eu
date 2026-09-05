// packages/emails/src/lib/render.ts
//
// U-05: resend@6.26.0 types include `react` on the send payload
// (RequireAtLeastOne of react/html/text). sendConfirmation uses `react:` +
// `text`. This helper still returns html via `@react-email/render` so tests
// and snapshots stay on one renderer.

import { render } from "@react-email/render";
import {
  ConfirmationEmail,
  confirmationPlainText,
  confirmationSubject,
} from "../ConfirmationEmail";
import type { BookingForEmail } from "./types";

export async function renderConfirmation(booking: BookingForEmail): Promise<{
  html: string;
  text: string;
  subject: string;
}> {
  const html = await render(ConfirmationEmail({ booking }));
  return {
    html,
    text: confirmationPlainText(booking),
    subject: confirmationSubject(booking),
  };
}
