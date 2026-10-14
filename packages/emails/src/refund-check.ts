// packages/emails/src/refund-check.ts
//
// Phase 31 D-09 / D-12: the nightly refund check's two internal mails to info@ (English only, never
// translated). The owner-approved text lives in .planning/phases/31-refunds-in-stripe/31-CONTEXT.md D-09
// and is used verbatim. A report names booking references, CHF amounts and Stripe ids only: the types
// below carry no person's name and no address, and nothing here may add one.

import { formatPaidTotal } from "./ConfirmationEmail";
import { escapeHtml } from "./escape";
import { layoutHtml, layoutText, ltrHtml, PHONE_DISPLAY } from "./layout";

/** What the nightly check found. Amounts in rappen (CHF); `createdAt` is the Stripe refund's ISO time. */
export type RefundCheckReport = {
  /** (a) Stripe refunded, the booking has no row for that refund. */
  missing: { reference: string; amountRappen: number; refundId: string; createdAt: string }[];
  /** (b) The booking's row for that refund has another amount. */
  amountDiffers: { reference: string; stripeRappen: number; siteRappen: number; refundId: string }[];
  /** (b) The booking's refunded total differs from the sum of its refund rows. */
  totalDiffers: { reference: string; bookingRappen: number; rowsRappen: number }[];
  /** (c) Stripe's status and the booking's disagree. */
  statusDiffers: { reference: string; stripeStatus: string; siteStatus: string; refundId: string }[];
  /** (d) The refund's payment belongs to no booking. */
  unlinked: { refundId: string; amountRappen: number; paymentIntentId: string | null }[];
  /** Stripe listed more refunds than the 500 cap; only the newest 500 were compared. */
  truncated: boolean;
};

type Mail = { subject: string; html: string; text: string };

const INTRO = [
  "Tonight's check compared the refunds Stripe made in the last 48 hours with the bookings on vamostaxi.site.",
  "Nothing was changed.",
];
const HEADING_MISSING = "Missing on the booking (Stripe refunded, the booking shows nothing):";
const HEADING_AMOUNTS = "Amounts differ:";
const HEADING_STATUS = "Status differs:";
const HEADING_UNLINKED = "Not linked to any booking:";
const CLOSING =
  "Open the payment in Stripe and the booking on your dashboard to see what happened. A refund missing on a booking usually means a webhook delivery failed: in Stripe, Developers › Webhooks shows failed deliveries and can resend them.";
// Not in D-09: new internal line, awaiting the owner's sign-off (Phase 31 hand-over)
const TRUNCATED_LINE = "Stripe listed more than 500 refunds; the newest 500 were compared.";

// The layouts' default footer is the sign-in link line ("This link works once…"); these mails carry the
// phone only, as the customer refund mail does.
const HTML_FOOTER = { footer: ltrHtml(PHONE_DISPLAY) };
const TEXT_FOOTER = { footer: PHONE_DISPLAY };

const DID_NOT_RUN_SUBJECT = "Refund check did not run";
const DID_NOT_RUN_BODY =
  "Stripe did not answer tonight's refund check, so nothing was compared. It runs again tomorrow at the same time.";

// Day, year and 24 h time in Zurich from Intl; the month from a fixed table, because en-GB spells
// September "Sept" in current ICU and the approved line reads "12 Oct 2026 14:05" (three letters).
const ZURICH_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct 2026 14:05" in Europe/Zurich, 24 h, no comma. An unreadable time is printed as given. */
function zurichTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts: Record<string, string> = {};
  for (const part of ZURICH_PARTS.formatToParts(date)) parts[part.type] = part.value;
  const month = MONTHS[Number(parts.month) - 1] ?? parts.month;
  return `${Number(parts.day)} ${month} ${parts.year} ${parts.hour}:${parts.minute}`;
}

type Section = { heading: string; lines: string[] };

function sections(report: RefundCheckReport): Section[] {
  const amountLines = [
    ...report.amountDiffers.map(
      (row) =>
        `- ${row.reference} · Stripe ${formatPaidTotal(row.stripeRappen)} · booking ${formatPaidTotal(row.siteRappen)} · refund ${row.refundId}`,
    ),
    ...report.totalDiffers.map(
      (row) =>
        // Not in D-09: new internal line, awaiting the owner's sign-off (Phase 31 hand-over)
        `- ${row.reference} · booking refunded ${formatPaidTotal(row.bookingRappen)} · refund records ${formatPaidTotal(row.rowsRappen)}`,
    ),
  ];
  const all: Section[] = [
    {
      heading: HEADING_MISSING,
      lines: report.missing.map(
        (row) =>
          `- ${row.reference} · ${formatPaidTotal(row.amountRappen)} · refund ${row.refundId} · ${zurichTime(row.createdAt)}`,
      ),
    },
    { heading: HEADING_AMOUNTS, lines: amountLines },
    {
      heading: HEADING_STATUS,
      lines: report.statusDiffers.map(
        (row) => `- ${row.reference} · Stripe ${row.stripeStatus} · booking ${row.siteStatus} · refund ${row.refundId}`,
      ),
    },
    {
      heading: HEADING_UNLINKED,
      lines: report.unlinked.map(
        (row) =>
          `- refund ${row.refundId} · ${formatPaidTotal(row.amountRappen)} · payment ${row.paymentIntentId ?? "none"}`,
      ),
    },
  ];
  return all.filter((section) => section.lines.length > 0);
}

/** Total finding lines across every section: the {n} of the subject. */
function findingCount(report: RefundCheckReport): number {
  return (
    report.missing.length +
    report.amountDiffers.length +
    report.totalDiffers.length +
    report.statusDiffers.length +
    report.unlinked.length
  );
}

/**
 * The nightly report (D-09), sent only when something is found. Subject, intro, the non-empty sections in
 * D-09 order, then the closing paragraph. Plain text and escaped HTML in the English layout; no React.
 */
export function renderRefundCheckEmail(report: RefundCheckReport): Mail {
  const subject = `Refund check: ${findingCount(report)} Stripe refund(s) do not match a booking`;
  const found = sections(report);

  const textBlocks = [INTRO.join("\n")];
  if (report.truncated) textBlocks.push(TRUNCATED_LINE);
  for (const section of found) textBlocks.push([section.heading, ...section.lines].join("\n"));
  textBlocks.push(CLOSING);

  const htmlBlocks = [`<p>${INTRO.map(escapeHtml).join("<br/>")}</p>`];
  if (report.truncated) htmlBlocks.push(`<p>${escapeHtml(TRUNCATED_LINE)}</p>`);
  for (const section of found) {
    const items = section.lines.map((line) => `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`).join("");
    htmlBlocks.push(`<p style="margin-bottom:4px;">${escapeHtml(section.heading)}</p><ul style="margin-top:0;">${items}</ul>`);
  }
  htmlBlocks.push(`<p>${escapeHtml(CLOSING)}</p>`);

  return {
    subject,
    html: layoutHtml("en", htmlBlocks.join(""), HTML_FOOTER),
    text: layoutText(textBlocks.join("\n\n"), TEXT_FOOTER),
  };
}

/** The short mail when Stripe does not answer the listing (D-09 "could not run"). */
export function renderRefundCheckDidNotRun(): Mail {
  return {
    subject: DID_NOT_RUN_SUBJECT,
    html: layoutHtml("en", `<p>${escapeHtml(DID_NOT_RUN_BODY)}</p>`, HTML_FOOTER),
    text: layoutText(DID_NOT_RUN_BODY, TEXT_FOOTER),
  };
}
