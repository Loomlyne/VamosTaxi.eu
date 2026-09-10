// packages/emails/src/lib/ics.ts
//
// D-20: `ics` `createEvent()` owns iCalendar syntax. This file does not
// assemble calendar markup by hand, fold lines, or escape commas/semicolons.

import { createEvent } from "ics";
import type { BookingForEmail, PayLinkExtraCode } from "./types";
import { t } from "./t";

const EXTRA_KEY: Record<PayLinkExtraCode, string> = {
  child_seat: "payLink.extraChildSeat",
  oversized_luggage: "payLink.extraOversized",
  extra_stop: "payLink.extraStop",
};

const ZURICH = "Europe/Zurich";

/** When `estimatedDurationMinutes` is null, the invite lasts one hour. */
const FALLBACK_DURATION_MINUTES = 60;

function inviteDescription(booking: BookingForEmail): string {
  const extras = booking.extras ?? [];
  if (extras.length === 0) return booking.manageUrl;
  const labels = extras.map((code) => t(booking.locale, EXTRA_KEY[code])).join(", ");
  return `${labels}\n${booking.manageUrl}`;
}

/**
 * `scheduled_local` is a Zurich wall-clock string (`YYYY-MM-DDTHH:MM`) with
 * no offset. Convert to a UTC instant via Intl — Workers and Vitest both
 * have `Europe/Zurich`.
 */
export function zurichLocalToUtc(scheduledLocal: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(scheduledLocal);
  if (!match) {
    throw new Error("scheduled_local must be YYYY-MM-DDTHH:MM");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const zurichWall = new Date(asUtc).toLocaleString("sv-SE", { timeZone: ZURICH });
  const asIfUtc = Date.parse(`${zurichWall.replace(" ", "T")}Z`);
  return new Date(asUtc + (asUtc - asIfUtc));
}

export function buildInvite(booking: BookingForEmail): string {
  const leg = booking.legs[0];
  if (!leg) {
    throw new Error("buildInvite requires a leg");
  }
  const start = zurichLocalToUtc(leg.scheduledLocal);
  const durationMinutes = leg.estimatedDurationMinutes ?? FALLBACK_DURATION_MINUTES;
  const { error, value } = createEvent({
    title: `${booking.reference} · ${leg.pickupText} → ${leg.dropoffText}`,
    location: leg.pickupText,
    description: inviteDescription(booking),
    start: [
      start.getUTCFullYear(),
      start.getUTCMonth() + 1,
      start.getUTCDate(),
      start.getUTCHours(),
      start.getUTCMinutes(),
    ],
    startInputType: "utc",
    startOutputType: "utc",
    duration: { minutes: durationMinutes },
    status: "CONFIRMED",
    productId: "vamostaxi/ics",
  });
  if (error || value == null) {
    throw error instanceof Error ? error : new Error("ics createEvent failed");
  }
  return value;
}
