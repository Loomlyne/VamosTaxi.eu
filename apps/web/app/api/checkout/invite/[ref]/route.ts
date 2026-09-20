export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { buildInvite, type BookingForEmail } from "@vamos/emails/confirmation";
import { BOOKING_REFERENCE_RE, isVoucherStatus, readBookingForConfirmation } from "@/lib/checkout/booking-read";
import { MANAGE_COOKIE_NAME } from "@/lib/checkout/manage-token";

function wallClock(raw: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(raw);
  if (match) return `${match[1]}T${match[2]}`;
  return "";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const { ref } = await context.params;
  if (!BOOKING_REFERENCE_RE.test(ref)) {
    return new Response(null, { status: 404 });
  }

  const jar = await cookies();
  const raw = jar.get(MANAGE_COOKIE_NAME)?.value ?? "";

  let env: CloudflareEnv | null = null;
  try {
    env = getCloudflareContext().env as CloudflareEnv;
  } catch {
    env = null;
  }
  if (!env || !raw) {
    return new Response(null, { status: 404 });
  }

  const booking = await readBookingForConfirmation(env, raw, ref);
  if (!booking.visible || !isVoucherStatus(booking.status)) {
    return new Response(null, { status: 404 });
  }

  const scheduledLocal = wallClock(booking.scheduledLocal);
  if (!scheduledLocal) {
    return new Response(null, { status: 404 });
  }

  const payload: BookingForEmail = {
    reference: booking.reference,
    contactName: "",
    contactEmail: "",
    locale: "en",
    displayCurrency: "CHF",
    totalRappen: null,
    manageUrl: "https://vamostaxi.site/manage-booking",
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText: booking.pickupText,
        dropoffText: booking.dropoffText,
        scheduledLocal,
        scheduledAt: scheduledLocal,
        flightNo: null,
        vehicleClassLabel: "",
        pax: booking.pax,
        bags: booking.bags,
        estimatedDurationMinutes: null,
      },
    ],
  };

  const ics = buildInvite(payload);
  return new Response(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${booking.reference}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
