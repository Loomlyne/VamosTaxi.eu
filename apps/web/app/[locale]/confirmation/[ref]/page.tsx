import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadSettingsVersion } from "@/lib/db/quote";
import { policyHours } from "@/lib/checkout/policy-settings";
import {
  BOOKING_REFERENCE_RE,
  isFailedStatus,
  isVoucherStatus,
  readBookingForConfirmation,
  type VisibleBooking,
} from "@/lib/checkout/booking-read";
import { customerClaims } from "@/lib/account/session";
import { MANAGE_COOKIE_NAME } from "@/lib/checkout/manage-token";
import { confirmationManageHref, type ConfirmationReadVia } from "@/lib/checkout/confirmation-manage-href";
import { ConfirmationClient, type ConfirmationPhase } from "./ConfirmationClient";
import "./confirmation.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale, ref } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  const robots = { index: false, follow: false };
  if (!BOOKING_REFERENCE_RE.test(ref)) {
    return { title: t("notVisibleTitle"), robots };
  }
  return { title: `${t("yourDriverIsBooked")} ${ref}`, robots };
}

function pendingTicket(ref: string): VisibleBooking {
  return {
    visible: true,
    reference: ref,
    status: "pending",
    pickupText: "",
    dropoffText: "",
    scheduledLocal: "",
    vehicleClassId: "",
    vehicleClassSlug: "",
    pax: 0,
    bags: 0,
    flightNo: "",
    extras: [],
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    couponCode: null,
    discountRappen: null,
    subtotalRappen: null,
    priceTotalRappen: null,
    fareLines: [],
    durationMin: null,
    distanceKm: null,
    paidAt: null,
    paymentStatus: null,
    refundStatus: null,
    refundOwedRappen: null,
    refundedRappen: null,
    receipt: { rows: [], chargedRappen: null, presentment: null, vehicleClassName: null },
  };
}

function workerEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env;
  } catch {
    return null;
  }
}

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale, ref } = await params;
  setRequestLocale(locale);

  const jar = await cookies();
  const raw = jar.get(MANAGE_COOKIE_NAME)?.value ?? "";
  const claims = await customerClaims();
  const env = workerEnv();

  let freeCancelHours: number | null = null;
  if (env) {
    try {
      freeCancelHours = policyHours(await loadSettingsVersion(env, new Date().toISOString())).freeCancelHours;
    } catch {
      // TBC pills stay TBC. Never invent hours.
    }
  }

  let initialPhase: ConfirmationPhase = "hidden";
  let booking: VisibleBooking | null = null;
  let readVia: ConfirmationReadVia = null;

  // Return path (D-27): a well-formed reference always opens the loading screen
  // first. The poller reads status; nothing here reveals whether the booking
  // exists (T-26.3-14-01). Facts are read only behind the manage cookie or claims.
  if (BOOKING_REFERENCE_RE.test(ref)) {
    initialPhase = "processing";
    booking = pendingTicket(ref);
    if (env && (raw || claims)) {
      try {
        // The manage cookie first, alone, so MANAGE BOOKING knows which door opens
        // this trip; then the session, as before (cookie, else account).
        let read = raw ? await readBookingForConfirmation(env, raw, ref, null) : null;
        if (read?.visible) {
          readVia = "cookie";
        } else if (claims) {
          read = await readBookingForConfirmation(env, "", ref, claims);
          if (read.visible) readVia = "account";
        }
        if (read?.visible) {
          booking = read;
          initialPhase = isVoucherStatus(read.status)
            ? "confirmed"
            : isFailedStatus(read.status)
              ? "failed"
              : "processing";
        }
      } catch {
        // A throw is not "this booking is pending" and not an error screen either:
        // the loading screen keeps polling.
      }
    }
  }

  return (
    <ConfirmationClient
      locale={locale}
      reference={ref}
      initialPhase={initialPhase}
      booking={booking}
      freeCancelHours={freeCancelHours}
      manageHref={confirmationManageHref(locale, ref, readVia)}
    />
  );
}
