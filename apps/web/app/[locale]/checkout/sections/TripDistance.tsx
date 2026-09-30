"use client";

import { useTranslations } from "next-intl";

/**
 * "148.2 km": the server's quote distance, written once by `kmFigure`. The figure keeps
 * its own direction inside Arabic (`.vt-dir-keep`); the unit is the translated word, so
 * Arabic reads "148.2 كم" in its own order.
 */
export function TripDistance({ km, className }: { km: string; className: string }) {
  const t = useTranslations("checkout");
  const [before, after] = t("distanceKm", { km: "\u0000" }).split("\u0000");
  return (
    <span className={className} data-co-distance>
      {before}
      <span className="vt-dir-keep">{km}</span>
      {after}
    </span>
  );
}
