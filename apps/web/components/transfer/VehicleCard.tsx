"use client";

import "./VehicleCard.css";
import type { ReactNode } from "react";
import { Icon, Badge } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function VehicleCard
// (components/transfer/VehicleCard.jsx, `_ds_bundle.js:44847-44940`). No `.dc.html`
// mock references this component anywhere in `app/` (confirmed by the usage audit
// `tests/support/mock-harness.ts`'s `COMPONENTS_WITHOUT_MOCK_USAGE` already records) —
// diffed against the vendored bundle directly via `mountBundle`, not against a mock.
export interface VehicleFeature {
  icon?: IconName;
  label: ReactNode;
}

export interface VehicleCardProps {
  name: ReactNode;
  examples?: ReactNode;
  /** Caller-supplied, already formatted through `apps/web/lib/currency.ts`'s
   * `formatAmount` — same "never a hardcoded currency literal" rule PriceSummary.tsx
   * follows; VehicleCard itself does no currency formatting of its own. */
  price?: ReactNode;
  /** No built-in English fallback ("Total, all taxes included" in the source) — same
   * "caller supplies, the dictionary resolves at the call site" pattern
   * 01-09-SUMMARY.md established for Counter/DatePicker's hardcoded-in-source copy. */
  priceNote?: ReactNode;
  passengers?: number;
  luggage?: number;
  image?: string;
  imageAlt?: string;
  icon?: IconName;
  features?: VehicleFeature[];
  badge?: ReactNode;
  selected?: boolean;
  /** Rule 2 addition — the compiled source has no disabled/loading concept at all;
   * UI-SPEC's own Component State Matrix marks both ("disabled = capacity exceeded;
   * loading = price computing"). */
  disabled?: boolean;
  loading?: boolean;
  onSelect?: () => void;
  className?: string;
}

export function VehicleCard({
  name,
  examples,
  price,
  priceNote,
  passengers,
  luggage,
  image,
  imageAlt,
  icon = "car-front",
  features = [],
  badge,
  selected = false,
  disabled = false,
  loading = false,
  onSelect,
  className = "",
}: VehicleCardProps) {
  const cls = [
    "vt-veh",
    selected ? "vt-veh--selected" : "",
    disabled ? "vt-veh--disabled" : "",
    loading ? "vt-veh--loading" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={disabled || loading ? undefined : onSelect}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={cls}
    >
      <span className="vt-veh__shot">
        {image ? (
          // Decorative fleet photo, not an optimisable content image; matches the
          // source's own plain <img>. (No `@next/eslint-plugin-next` is installed in
          // this repo — plan 03-06's eslint.config.mjs is deliberately minimal, two
          // rules only — so there is no `no-img-element` rule here to disable.)
          <img src={image} alt={imageAlt ?? ""} width={640} height={400} loading="lazy" decoding="async" />
        ) : (
          <Icon name={icon} size={34} color="var(--vt-grey-400)" />
        )}
      </span>
      <span className="vt-veh__body">
        <span className="vt-veh__headline">
          <h4 className="vt-veh__name">{name}</h4>
          {badge ? <Badge tone="accent">{badge}</Badge> : null}
        </span>
        {examples ? <p className="vt-veh__examples">{examples}</p> : null}
        <span className="vt-veh__caps">
          {passengers != null ? (
            <span className="vt-veh__cap">
              <Icon name="users" size={15} color="var(--vt-text-muted)" />
              {/* Capacity figures keep their own direction inside Arabic (UI-SPEC's
                  Four-Language Layout Contract). */}
              <span className="vt-dir-keep">{passengers}</span>
            </span>
          ) : null}
          {luggage != null ? (
            <span className="vt-veh__cap">
              <Icon name="luggage" size={15} color="var(--vt-text-muted)" />
              <span className="vt-dir-keep">{luggage}</span>
            </span>
          ) : null}
          {features.map((ft, i) => (
            <span className="vt-veh__cap" key={typeof ft.label === "string" ? ft.label : i}>
              {ft.icon ? <Icon name={ft.icon} size={15} color="var(--vt-text-muted)" /> : null}
              {ft.label}
            </span>
          ))}
        </span>
      </span>
      <span className="vt-veh__price">
        {loading ? (
          <span className="vt-veh__amount" aria-busy="true">
            <Icon name="loader-circle" size={16} color="var(--vt-text-muted)" className="vt-veh__spin" />
          </span>
        ) : (
          <span className="vt-veh__amount vt-dir-keep">{price}</span>
        )}
        {priceNote ? <span className="vt-veh__note">{priceNote}</span> : null}
      </span>
    </button>
  );
}
