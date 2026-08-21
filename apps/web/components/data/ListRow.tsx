import "./ListRow.css";
import type { MouseEventHandler, ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function ListRow
// (components/data/ListRow.jsx, `_ds_bundle.js:43515-43556`). Renders a `<button>` when
// `onClick` is supplied (the clickable-row variant), a plain `<div>` otherwise — ported
// verbatim from the source's own branch, not re-derived.
export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  lead?: ReactNode;
  meta?: ReactNode;
  chevron?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  inverse?: boolean;
  last?: boolean;
  /** Rule 2 addition — the compiled source has no selected concept for a row at all
   * (only List/ListRow's *own* Component State Matrix row marks a Selected column;
   * confirmed by reading the source signature directly). A neutral background + bolder
   * title, not a tinted surface — same reasoning as the lead-tile fix below. */
  selected?: boolean;
  className?: string;
}

export function ListRow({
  title,
  subtitle,
  icon,
  lead,
  meta,
  chevron = false,
  onClick,
  inverse = false,
  last = false,
  selected = false,
  className = "",
}: ListRowProps) {
  const cls = [
    onClick ? "vt-row--button" : "vt-row",
    inverse ? "vt-row--inverse" : "",
    last ? "vt-row--last" : "",
    selected ? "vt-row--selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Law 02 fix: the source's icon-lead variant fills this tile with
  // `var(--vt-yellow-50)` and colours the glyph `var(--vt-yellow-700)` — both banned
  // tinted-yellow steps. Decision (per CLAUDE.md § "when a kit component has no
  // untinted variant, build the piece from tokens"): the tinted variant is dropped, not
  // neutralised — the lead slot renders on a white surface with the design system's
  // subtle hairline (ListRow.css), or on charcoal for the inverse treatment, the same
  // call Plan 06 made for Card's accent tone and Badge's warning tone.
  const leadIconColor = inverse ? "var(--vt-accent)" : "var(--vt-charcoal-700)";

  const inner = (
    <>
      {lead ??
        (icon ? (
          <span className="vt-row__lead">
            <Icon name={icon} size={17} color={leadIconColor} />
          </span>
        ) : null)}
      <span className="vt-row__main">
        <span className="vt-row__title">{title}</span>
        {subtitle ? <span className="vt-row__sub">{subtitle}</span> : null}
      </span>
      {meta ? <span className="vt-row__meta">{meta}</span> : null}
      {chevron ? (
        // Wrapped so the RTL mirror rule in ListRow.css has something to target — a
        // forward-pointing chevron must flip under dir="rtl" (UI-SPEC's Four-Language
        // Layout Contract, "Must mirror" table), same fix class as DatePicker's own nav
        // chevrons (01-09-SUMMARY.md § Deviations).
        <span className="vt-row__chevron">
          <Icon name="chevron-right" size={16} color="var(--vt-text-muted)" />
        </span>
      ) : null}
    </>
  );

  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
