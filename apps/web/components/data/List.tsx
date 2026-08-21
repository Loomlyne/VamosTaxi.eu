import "./List.css";
import { Children } from "react";
import type { ReactNode } from "react";
import { Icon } from "../core";

// design-system component bundle (reference-only per D-30), function List
// (components/data/ListRow.jsx — the source declares `List` in the same file as
// `ListRow`, `_ds_bundle.js:43557-43567`). A plain container: `inset` toggles the
// bordered-card treatment vs. an unstyled stack of rows.
export interface ListProps {
  inset?: boolean;
  /** Rule 2 addition — the compiled source's `function List` signature has no
   * loading/empty concept; the design system's own stated rule ("state it in words…
   * never a fake number or a shimmering block pretending to be data",
   * `design-system/readme.md` §3) is what this state exists to satisfy. */
  loading?: boolean;
  loadingLabel?: ReactNode;
  /** No built-in English fallback — see Table.tsx's comment on the same pattern. */
  emptyMessage?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function List({
  inset = true,
  loading = false,
  loadingLabel,
  emptyMessage,
  children,
  className = "",
}: ListProps) {
  const cls = ["vt-list", inset ? "" : "vt-list--plain", className].filter(Boolean).join(" ");

  if (loading) {
    return (
      <div className={cls} aria-busy="true">
        <div className="vt-list__state">
          <Icon name="loader-circle" size={16} color="var(--vt-text-muted)" className="vt-list__spin" />
          {loadingLabel}
        </div>
      </div>
    );
  }

  if (Children.count(children) === 0) {
    return (
      <div className={cls}>
        <div className="vt-list__state">{emptyMessage}</div>
      </div>
    );
  }

  return <div className={cls}>{children}</div>;
}
