import { getTranslations } from "next-intl/server";
import { Card } from "@/components/core";
import { List } from "@/components/data";
import { StatusBadge } from "@/components/transfer";
import type { BookingStatus } from "@/components/transfer";
import { RouteSummary } from "@/components/transfer";
import { formatAmount } from "@/lib/currency";
import type { BookingHistoryRow } from "@/lib/ops/customers";

const STATUS_BADGE: Record<string, BookingStatus> = {
  quote: "quote",
  pending: "pending",
  paid: "paid",
  confirmed: "confirmed",
  assigned: "assigned",
  completed: "completed",
  cancelled: "cancelled",
  partially_cancelled: "cancelled",
  partially_completed: "completed",
  refunded: "refunded",
  no_show: "no-show",
};

function badgeStatus(status: string): BookingStatus | undefined {
  return STATUS_BADGE[status];
}

export async function BookingHistoryList({ bookings }: { bookings: BookingHistoryRow[] }) {
  const t = await getTranslations("ops");

  return (
    <section data-booking-history="1" style={{ marginBlockStart: 28 }}>
      <h2
        style={{
          margin: "0 0 14px",
          fontFamily: "var(--vt-font-display)",
          fontSize: "var(--vt-heading-3)",
          fontWeight: "var(--vt-weight-semibold)",
        }}
      >
        {t("customers-history")}
      </h2>
      <List
        inset={false}
        emptyMessage={<span data-history-empty="1">{t("customers-history-empty")}</span>}
      >
        {bookings.map((booking) => {
          const status = badgeStatus(booking.status);
          return (
            <Card
              key={booking.id}
              padding="md"
              data-booking-id={booking.id}
              data-booking-ref={booking.reference}
              data-price-null={booking.priceTotalRappen == null ? "1" : undefined}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBlockEnd: 12,
                }}
              >
                <span className="vt-dir-keep" style={{ fontWeight: "var(--vt-weight-semibold)" }}>
                  {booking.reference}
                </span>
                {status ? <StatusBadge status={status} /> : <span>{booking.status}</span>}
                <span className="vt-dir-keep" data-booking-total="1">
                  {/* D-14: pass the raw number | null. formatAmount(null) is CHF 000,
                      never a coerced zero. Until pricing_live a non-null rappen value
                      still goes through the helper rather than a hardcoded mark. */}
                  {formatAmount(booking.priceTotalRappen)}
                </span>
              </div>
              {booking.legs.map((leg) => (
                <RouteSummary
                  key={`${booking.id}-${leg.legSeq}`}
                  pickup={leg.pickupText}
                  dropoff={leg.dropoffText}
                  meta={[
                    {
                      label: (
                        <span className="vt-dir-keep">{leg.scheduledLocal}</span>
                      ),
                    },
                    ...(leg.flightNo
                      ? [
                          {
                            label: <span className="vt-dir-keep">{leg.flightNo}</span>,
                          },
                        ]
                      : []),
                  ]}
                />
              ))}
            </Card>
          );
        })}
      </List>
    </section>
  );
}
