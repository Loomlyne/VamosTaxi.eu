"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@/components/navigation/Tabs";
import type { RateBook, ServiceZoneRow, VehicleClassOption } from "@/lib/ops/rate-book";
import { DistanceRateTable } from "./DistanceRateTable";
import { FixedRouteTable } from "./FixedRouteTable";
import { SurchargeTable } from "./SurchargeTable";
import "./RateBookTabs.css";

export function RateBookTabs({
  book,
  zones,
  classes,
}: {
  book: RateBook;
  zones: ServiceZoneRow[];
  classes: VehicleClassOption[];
}) {
  const t = useTranslations("ops");
  const [tab, setTab] = useState("distance");
  const frozen = book.status !== "draft";

  return (
    <div className="vt-rate-book" data-ops-rate-book-tabs="1" data-ops-version-status={book.status}>
      <div className="vt-rate-book__meta">
        <span className="vt-rate-book__kicker">{book.slug}</span>
        <span className="vt-rate-book__status" data-status={book.status} data-ops-version-status={book.status}>
          {book.status === "draft"
            ? t("pricing.status-draft")
            : book.status === "live"
              ? t("pricing.status-live")
              : t("pricing.status-retired")}
        </span>
      </div>
      <p className="vt-rate-book__hint">
        {frozen ? t("pricing.rateBook.frozen-hint") : t("pricing.rateBook.available-hint")}
      </p>
      <Tabs
        variant="underline"
        value={tab}
        onChange={setTab}
        items={[
          { value: "distance", label: t("pricing.tab-distance") },
          { value: "routes", label: t("pricing.tab-routes") },
          { value: "surcharges", label: t("pricing.tab-surcharges") },
        ]}
      />
      {tab === "distance" ? (
        <DistanceRateTable
          versionId={book.versionId}
          status={book.status}
          rows={book.distanceRates}
          classes={classes}
        />
      ) : null}
      {tab === "routes" ? (
        <FixedRouteTable
          versionId={book.versionId}
          status={book.status}
          rows={book.fixedRoutes}
          zones={zones}
          classes={classes}
        />
      ) : null}
      {tab === "surcharges" ? (
        <SurchargeTable versionId={book.versionId} status={book.status} rows={book.surcharges} />
      ) : null}
    </div>
  );
}
