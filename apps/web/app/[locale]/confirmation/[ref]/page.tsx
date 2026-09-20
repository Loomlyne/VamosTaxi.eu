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

  if (BOOKING_REFERENCE_RE.test(ref) && (raw || claims)) {
    if (!env) {
      // Local next has no Hyperdrive. Cookie present → processing; the
      // poller is the source of truth for status.
      initialPhase = "processing";
      booking = pendingTicket(ref);
    } else {
      try {
        const read = await readBookingForConfirmation(env, raw, ref, claims);
        if (read.visible) {
          booking = read;
          initialPhase = isVoucherStatus(read.status)
            ? "confirmed"
            : isFailedStatus(read.status)
              ? "failed"
              : "processing";
        }
      } catch {
        // Worker env is present. A throw is not "this booking is pending".
        // Same as checkout status HIDDEN — stay hidden, never invent pending.
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
    />
  );
}
