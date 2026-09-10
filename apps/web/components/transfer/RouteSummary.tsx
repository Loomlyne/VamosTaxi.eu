"use client";

import "./RouteSummary.css";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function RouteSummary
// (components/transfer/RouteSummary.jsx, `_ds_bundle.js:44700-44779`). Two-stop rail
// (pip/line/pip) + labelled stops + an optional meta row (01-PATTERNS.md).
//
// I18N-01: the source hardcodes its two stop kickers as the English literals "Pickup"
// and "Destination" — in the port these become dictionary lookups. Both keys already
// exist, fully translated in all four languages, as `common.pickup`/`common.destination`
// (migrated from a mock in Plan 07's dictionary pass) — reused directly rather than
// duplicated under a new namespace.
export interface RouteMetaItem {
  icon?: IconName;
  /** Caller-supplied — wrap a time/date/reference value in a `.vt-dir-keep` span before
   * passing it here if it must keep its own direction inside Arabic (UI-SPEC's
   * Four-Language Layout Contract); a translated word (e.g. a vehicle class name)
   * should NOT be wrapped, or it would be forced left-to-right even when the active
   * language is genuinely RTL. RouteSummary itself cannot tell which kind of content a
   * given meta item carries, so this is the caller's call, not this component's. */
  label: ReactNode;
}

export interface RouteSummaryProps {
  pickup?: ReactNode;
  dropoff?: ReactNode;
  pickupDetail?: ReactNode;
  dropoffDetail?: ReactNode;
  /** Optional chip on the rail between the two stops (e.g. trip duration). */
  duration?: ReactNode;
  meta?: RouteMetaItem[];
  inverse?: boolean;
  /** Rule 2 addition — the compiled source has no loading/empty concept; UI-SPEC's own
   * Component State Matrix marks both ("loading = geocoding in progress; empty = no
   * route entered"), relevant from Phase 4 on, ported now so the state exists. */
  loading?: boolean;
  loadingLabel?: ReactNode;
  empty?: boolean;
  emptyMessage?: ReactNode;
  className?: string;
}

export function RouteSummary({
  pickup,
  dropoff,
  pickupDetail,
  dropoffDetail,
  duration,
  meta = [],
  inverse = false,
  loading = false,
  loadingLabel,
  empty = false,
  emptyMessage,
  className = "",
}: RouteSummaryProps) {
  const t = useTranslations("common");
  const cls = ["vt-route", inverse ? "vt-route--inverse" : "", className].filter(Boolean).join(" ");

  if (loading) {
    return (
      <div className={cls} aria-busy="true">
        <div className="vt-route__state">
          <Icon name="loader-circle" size={16} color="var(--vt-text-muted)" className="vt-route__spin" />
          {loadingLabel}
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={cls}>
        <div className="vt-route__state">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <div className="vt-route__leg">
        <div className="vt-route__rail">
          <span className="vt-route__pip" />
          <span className="vt-route__line" />
          <span className="vt-route__pip vt-route__pip--end" />
        </div>
        <div className="vt-route__stops">
          <div className="vt-route__stop">
            <span className="vt-route__kicker">{t("pickup")}</span>
            <div className="vt-route__place">{pickup}</div>
            {pickupDetail ? <div className="vt-route__detail">{pickupDetail}</div> : null}
          </div>
          {duration ? <div className="vt-route__duration">{duration}</div> : null}
          <div className="vt-route__stop vt-route__stop--last">
            <span className="vt-route__kicker">{t("destination")}</span>
            <div className="vt-route__place">{dropoff}</div>
            {dropoffDetail ? <div className="vt-route__detail">{dropoffDetail}</div> : null}
          </div>
        </div>
      </div>
      {meta.length > 0 ? (
        <div className="vt-route__meta">
          {meta.map((m, i) => (
            <span className="vt-route__metaitem" key={typeof m.label === "string" ? m.label : i}>
              {m.icon ? <Icon name={m.icon} size={18} color="var(--vt-text-muted)" /> : null}
              {m.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
