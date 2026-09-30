"use client";

import { useTranslations } from "next-intl";

/**
 * "148.2 km": the server's quote distance, written once by `kmFigure`. The figure keeps
 * its own direction inside Arabic (`.vt-dir-keep`); the unit is the translated word, so
 * Arabic reads "148.2 كم" in its own order.
 *
 * `noRoad` (any leg without a road line, straight-line fare) writes the words "No road
 * route" instead of a figure. Returns nothing when there is neither.
 */
export function TripDistance({
  km,
  noRoad = false,
  className,
}: {
  km?: string | null;
  noRoad?: boolean;
  className: string;
}) {
  const t = useTranslations("checkout");
  if (noRoad) {
    return (
      <span className={className} data-co-distance data-co-no-road>
        {t("noRoadRoute")}
      </span>
    );
  }
  if (!km) return null;
  const [before, after] = t("distanceKm", { km: "\u0000" }).split("\u0000");
  return (
    <span className={className} data-co-distance>
      {before}
      <span className="vt-dir-keep">{km}</span>
      {after}
    </span>
  );
}
