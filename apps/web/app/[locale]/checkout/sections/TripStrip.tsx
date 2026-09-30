"use client";

import type { Ref } from "react";
import { useTranslations } from "next-intl";
import { Icon, IconButton } from "@/components/core";
import { formatTripWhen } from "@/lib/checkout/trip-format";
import type { Trip } from "@/lib/checkout/trip-url";
import { TripDistance } from "./TripDistance";

/**
 * UI-SPEC S2 trip strip: back chevron (home always opens empty), route on line 1,
 * "18.4 km · Tue 29 Sept, 08:15 · 2 passengers · 3 bags" on line 2, and "Edit trip" at the end.
 */
export function TripStrip({
  trip,
  locale,
  distanceKm,
  onBack,
  onEdit,
  editRef,
}: {
  trip: Trip;
  locale: string;
  /** The server's quote distance, already written as "18.4"; null while there is none. */
  distanceKm?: string | null;
  onBack: () => void;
  onEdit: () => void;
  editRef: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations("checkout");
  const pax = trip.pax ?? 0;
  const bags = trip.bags ?? 0;
  const when = formatTripWhen(trip.when, locale);
  const counts = [pax ? t("passengersCount", { n: pax }) : "", t("bagsCount", { n: bags })].filter(Boolean);

  return (
    <div className="vt-co__strip" data-co-strip>
      <span className="vt-co__strip-back">
        <IconButton icon="chevron-left" label={t("backAria")} onClick={onBack} data-co-back />
      </span>
      <div className="vt-co__strip-copy">
        <p className="vt-co__strip-route" data-co-route>
          <span className="vt-co__strip-place" dir="auto">{trip.from}</span>
          <Icon name="arrow-right" size={16} color="var(--vt-text-muted)" className="vt-co__strip-arrow" />
          <span className="vt-co__strip-place" dir="auto">{trip.to}</span>
        </p>
        <p className="vt-co__strip-facts" data-co-facts>
          {distanceKm ? (
            <>
              <TripDistance km={distanceKm} className="vt-co__strip-km" />
              {" · "}
            </>
          ) : null}
          {when ? <span className="vt-dir-keep">{when}</span> : null}
          {when ? " · " : ""}
          {counts.join(" · ")}
        </p>
      </div>
      <button type="button" className="vt-co__link" onClick={onEdit} ref={editRef} data-co-edit>
        {t("editTrip")}
      </button>
    </div>
  );
}
