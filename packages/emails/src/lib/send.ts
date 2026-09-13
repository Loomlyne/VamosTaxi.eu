// packages/emails/src/lib/send.ts
//
// Confirmation send only. This package never claims and never settles —
// notification_claim / notification_settle are the Queue consumer's
// (plan 07-07), vamos_system-only. No postgres, no @vamos/db.
//
// The catch below is the other half of claim-then-send: an exception
// escaping here would leave a claimed row with neither sent_at nor
// failed_at (the stuck-row failure the 07-03 sweep exists to clean up).

import { Resend } from "resend";
import { ConfirmationEmail } from "../ConfirmationEmail";
import {
  ChauffeurAssignEmail,
  chauffeurAssignPlainText,
  chauffeurAssignSubject,
  type ChauffeurDispatchForEmail,
} from "../ChauffeurAssignEmail";
import {
  ChauffeurUnassignEmail,
  chauffeurUnassignPlainText,
  chauffeurUnassignSubject,
} from "../ChauffeurUnassignEmail";
import { PayLinkEmail, payLinkPlainText, payLinkSubject } from "../PayLinkEmail";
import {
  OpsMustFixEmail,
  opsMustFixPlainText,
  opsMustFixSubject,
  type OpsMustFixForEmail,
} from "../OpsMustFixEmail";
import { renderRefundEmail, type RefundKind } from "../refund";
import {
  CancellationEmail,
  cancellationPlainText,
  cancellationSubject,
  type CancellationForEmail,
} from "../CancellationEmail";
import {
  RefundFailedEmail,
  refundFailedPlainText,
  refundFailedSubject,
  type RefundFailedForEmail,
} from "../RefundFailedEmail";
import {
  Reminder24hEmail,
  reminder24hPlainText,
  reminder24hSubject,
  type Reminder24hForEmail,
} from "../Reminder24hEmail";
import {
  AssignmentCustomerEmail,
  assignmentCustomerPlainText,
  assignmentCustomerSubject,
  type AssignmentCustomerForEmail,
} from "../AssignmentCustomerEmail";
import {
  TimeChangeEmail,
  timeChangePlainText,
  timeChangeSubject,
  type TimeChangeForEmail,
} from "../TimeChangeEmail";
import {
  FlightNumberEmail,
  flightNumberPlainText,
  flightNumberSubject,
  type FlightNumberForEmail,
} from "../FlightNumberEmail";
import {
  ReviewRequestEmail,
  reviewRequestPlainText,
  reviewRequestSubject,
  type ReviewRequestForEmail,
} from "../ReviewRequestEmail";
import { chauffeurEmailLocale } from "./chauffeur-locale";
import { buildInvite } from "./ics";
import { renderConfirmation } from "./render";
import type { BookingForEmail, EmailLocale, PayLinkForEmail, SendOutcome } from "./types";
import type { ReactElement } from "react";

export { chauffeurEmailLocale };
export type {
  ChauffeurDispatchForEmail,
  OpsMustFixForEmail,
  CancellationForEmail,
  RefundFailedForEmail,
  Reminder24hForEmail,
  AssignmentCustomerForEmail,
  TimeChangeForEmail,
  FlightNumberForEmail,
  ReviewRequestForEmail,
};

/**
 * Bump the trailing serial when rendered content changes; bump the date
 * when the template is rewritten. Never send the column's empty default.
 * The claim RPC raises if this fails the version regex.
 */
export const CONFIRMATION_TEMPLATE_VERSION = "confirmation@2026-09-05-1";

/**
 * Worker-secret shape. `RESEND_API_KEY` reaches the Worker via
 * `wrangler secret put`, never `vars`, never `NEXT_PUBLIC_*`.
 * Added to `apps/web/lib/env.d.ts` in plan 07-07, where the Worker reads it
 * for this send path.
 */
export type EmailEnv = {
  RESEND_API_KEY: string;
};

const FROM = "Vamos Taxi <noreply@vamostaxi.site>";

/**
 * D-30: lifecycle ops copies (cancel / time / flight / refund-failed) go to
 * bookings@vamostaxi.site (web BOOKINGS_OPS_EMAIL). Never info@.
 */
export const LIFECYCLE_OPS_EMAIL = "bookings@vamostaxi.site";

function uniqueEmails(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  return [...new Set(list.map((addr) => addr.trim().toLowerCase()).filter(Boolean))];
}

async function sendReactMail(
  env: EmailEnv,
  to: string | string[],
  subject: string,
  react: ReactElement,
  text: string,
  failLabel: string,
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const unique = uniqueEmails(to);
    if (unique.length === 0) {
      return { ok: false, error: `no ${failLabel} recipients` };
    }
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to: unique,
      subject,
      react,
      text,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : `${failLabel} failed`;
    return { ok: false, error: message };
  }
}

export async function sendConfirmation(
  env: EmailEnv,
  booking: BookingForEmail,
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const { text, subject } = await renderConfirmation(booking);
    const invite = buildInvite(booking);
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to: booking.contactEmail,
      subject,
      react: ConfirmationEmail({ booking }),
      text,
      attachments: [
        {
          filename: `${booking.reference}.ics`,
          content: Buffer.from(invite, "utf8").toString("base64"),
        },
      ],
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sendConfirmation failed";
    return { ok: false, error: message };
  }
}

export async function sendPayLink(
  env: EmailEnv,
  link: PayLinkForEmail,
  to: string[],
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const unique = [...new Set(to.map((addr) => addr.trim().toLowerCase()).filter(Boolean))];
    if (unique.length === 0) {
      return { ok: false, error: "no pay-link recipients" };
    }
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to: unique,
      subject: payLinkSubject(link),
      react: PayLinkEmail({ link }),
      text: payLinkPlainText(link),
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sendPayLink failed";
    return { ok: false, error: message };
  }
}

/**
 * D-24: price-changed mail after Publish. Owner English is TBC — skip-send
 * until copy exists. Do not invent a body, subject, or de/fr/ar. Callers pass
 * the old locked CHF only; never a new-book number.
 */
export type LockMailSkip = { ok: true; skipped: true };

export type PriceChangedMailInput = {
  locale: EmailLocale;
  contactEmail: string;
  /** Old locked snapshot, CHF rappen. Never a live-book figure. */
  lockedRappen: number;
};

export type ExpiredMailInput = {
  locale: EmailLocale;
  contactEmail: string;
  lockedRappen: number;
};

export async function sendPriceChanged(
  _env: EmailEnv,
  _input: PriceChangedMailInput,
): Promise<LockMailSkip> {
  return { ok: true, skipped: true };
}

export async function sendExpired(
  _env: EmailEnv,
  _input: ExpiredMailInput,
): Promise<LockMailSkip> {
  return { ok: true, skipped: true };
}

/** D-60: contact plus company payer when the address is different. */
export function refundMailRecipients(
  contactEmail: string,
  payerEmail?: string | null,
): string[] {
  const contact = contactEmail.trim().toLowerCase();
  const payer = (payerEmail ?? "").trim().toLowerCase();
  const out: string[] = [];
  if (contact) out.push(contact);
  if (payer && payer !== contact) out.push(payer);
  return out;
}

export async function sendRefund(
  env: EmailEnv,
  input: {
    locale: EmailLocale;
    kind: RefundKind;
    to: string;
    name: string;
    reference: string;
  },
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const to = input.to.trim().toLowerCase();
    if (!to) {
      return { ok: false, error: "no refund recipient" };
    }
    const rendered = renderRefundEmail(input.locale, input.kind, {
      name: input.name,
      reference: input.reference,
    });
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sendRefund failed";
    return { ok: false, error: message };
  }
}

async function sendChauffeurDispatch(
  env: EmailEnv,
  trip: ChauffeurDispatchForEmail,
  to: string,
  kind: "assign" | "unassign",
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const recipient = to.trim().toLowerCase();
    if (!recipient) {
      return { ok: false, error: "no chauffeur recipient" };
    }
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to: recipient,
      subject:
        kind === "unassign" ? chauffeurUnassignSubject(trip) : chauffeurAssignSubject(trip),
      react:
        kind === "unassign"
          ? ChauffeurUnassignEmail({ trip })
          : ChauffeurAssignEmail({ trip }),
      text:
        kind === "unassign"
          ? chauffeurUnassignPlainText(trip)
          : chauffeurAssignPlainText(trip),
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : kind === "unassign"
          ? "sendChauffeurUnassign failed"
          : "sendChauffeurAssign failed";
    return { ok: false, error: message };
  }
}

export async function sendChauffeurAssign(
  env: EmailEnv,
  trip: ChauffeurDispatchForEmail,
  to: string,
): Promise<SendOutcome> {
  return sendChauffeurDispatch(env, trip, to, "assign");
}

export async function sendChauffeurUnassign(
  env: EmailEnv,
  trip: ChauffeurDispatchForEmail,
  to: string,
): Promise<SendOutcome> {
  return sendChauffeurDispatch(env, trip, to, "unassign");
}

export async function sendOpsMustFix(
  env: EmailEnv,
  payload: OpsMustFixForEmail,
  to: string,
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const recipient = to.trim().toLowerCase();
    if (!recipient) {
      return { ok: false, error: "no ops recipient" };
    }
    if (payload.trips.length === 0) {
      return { ok: false, error: "no must-fix trips" };
    }
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to: recipient,
      subject: opsMustFixSubject(payload),
      react: OpsMustFixEmail({ payload }),
      text: opsMustFixPlainText(payload),
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sendOpsMustFix failed";
    return { ok: false, error: message };
  }
}

export async function sendCancellation(
  env: EmailEnv,
  trip: CancellationForEmail,
  to: string | string[],
): Promise<SendOutcome> {
  return sendReactMail(
    env,
    to,
    cancellationSubject(trip),
    CancellationEmail({ trip }),
    cancellationPlainText(trip),
    "sendCancellation",
  );
}

export async function sendRefundFailed(
  env: EmailEnv,
  trip: RefundFailedForEmail,
  to: string | string[] = LIFECYCLE_OPS_EMAIL,
): Promise<SendOutcome> {
  return sendReactMail(
    env,
    to,
    refundFailedSubject(trip),
    RefundFailedEmail({ trip }),
    refundFailedPlainText(trip),
    "sendRefundFailed",
  );
}

export async function sendReminder24h(
  env: EmailEnv,
  trip: Reminder24hForEmail,
  to: string | string[],
): Promise<SendOutcome> {
  return sendReactMail(
    env,
    to,
    reminder24hSubject(trip),
    Reminder24hEmail({ trip }),
    reminder24hPlainText(trip),
    "sendReminder24h",
  );
}

export async function sendAssignmentCustomer(
  env: EmailEnv,
  trip: AssignmentCustomerForEmail,
  to: string | string[],
): Promise<SendOutcome> {
  return sendReactMail(
    env,
    to,
    assignmentCustomerSubject(trip),
    AssignmentCustomerEmail({ trip }),
    assignmentCustomerPlainText(trip),
    "sendAssignmentCustomer",
  );
}

export async function sendTimeChange(
  env: EmailEnv,
  trip: TimeChangeForEmail,
  to: string | string[],
): Promise<SendOutcome> {
  return sendReactMail(
    env,
    to,
    timeChangeSubject(trip),
    TimeChangeEmail({ trip }),
    timeChangePlainText(trip),
    "sendTimeChange",
  );
}

export async function sendFlightNumber(
  env: EmailEnv,
  trip: FlightNumberForEmail,
  to: string | string[],
): Promise<SendOutcome> {
  return sendReactMail(
    env,
    to,
    flightNumberSubject(trip),
    FlightNumberEmail({ trip }),
    flightNumberPlainText(trip),
    "sendFlightNumber",
  );
}

export async function sendReviewRequest(
  env: EmailEnv,
  trip: ReviewRequestForEmail,
  to: string | string[],
): Promise<SendOutcome> {
  return sendReactMail(
    env,
    to,
    reviewRequestSubject(trip),
    ReviewRequestEmail({ trip }),
    reviewRequestPlainText(trip),
    "sendReviewRequest",
  );
}
