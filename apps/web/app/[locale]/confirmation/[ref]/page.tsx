import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { asQuote } from "@/lib/db/identity";
import {
  BOOKING_REFERENCE_RE,
  isVoucherStatus,
  readBookingForConfirmation,
  type VisibleBooking,
} from "@/lib/checkout/booking-read";
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
  return { title: `${t("yourDriverIsBooked")} ${ref}` };
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
  const env = workerEnv();

  let freeCancelHours: number | null = null;
  if (env) {
    try {
      const rows = await asQuote(env, (sql) =>
        sql<{ free_cancel_hours: number }[]>`
          select free_cancel_hours
            from public.quote_settings_version()
        `,
      );
      const row = rows[0];
      if (row) freeCancelHours = row.free_cancel_hours;
    } catch {
      // TBC pills stay TBC. Never invent hours.
    }
  }

  let initialPhase: ConfirmationPhase = "hidden";
  let booking: VisibleBooking | null = null;

  if (BOOKING_REFERENCE_RE.test(ref) && raw) {
    if (!env) {
      // Local next has no Hyperdrive. Cookie present → processing; the
      // poller is the source of truth for status.
      initialPhase = "processing";
      booking = {
        visible: true,
        reference: ref,
        status: "pending",
        pickupText: "",
        dropoffText: "",
        scheduledLocal: "",
        vehicleClassId: "",
        pax: 0,
        bags: 0,
      };
    } else {
      try {
        const read = await readBookingForConfirmation(env, raw, ref);
        if (read.visible) {
          booking = read;
          initialPhase = isVoucherStatus(read.status) ? "confirmed" : "processing";
        }
      } catch {
        // Cookie is present; identity failed (no Hyperdrive in `next dev`).
        // Poller still owns status. Never 500 a guest return URL.
        initialPhase = "processing";
        booking = {
          visible: true,
          reference: ref,
          status: "pending",
          pickupText: "",
          dropoffText: "",
          scheduledLocal: "",
          vehicleClassId: "",
          pax: 0,
          bags: 0,
        };
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
