import "./StatTile.css";
import type { ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function StatTile
// (components/data/StatTile.jsx, `_ds_bundle.js:43589-43619`). No `.dc.html` mock
// references this component anywhere in `app/` (confirmed by the usage audit
// `tests/support/mock-harness.ts`'s `COMPONENTS_WITHOUT_MOCK_USAGE` already records) —
// diffed against the vendored bundle directly via `mountBundle`, not against a mock.
export type StatTileTone = "default" | "accent" | "inverse";

export interface StatTileProps {
  label: ReactNode;
  /** Omit (or pass `null`) for the empty state — see `emptyMessage`. */
  value?: ReactNode;
  icon?: IconName;
  foot?: ReactNode;
  tone?: StatTileTone;
  /** Rule 2 addition — the compiled source's `function StatTile` signature has no
   * loading/empty concept (Table.tsx's comment explains the same gap for its own
   * component; design-system readme.md §3's words-not-shimmer rule is what both exist
   * to satisfy). */
  loading?: boolean;
  /** No built-in English fallback — see Table.tsx's comment on this pattern. */
  emptyMessage?: ReactNode;
  className?: string;
}

export function StatTile({
  label,
  value,
  icon,
  foot,
  tone = "default",
  loading = false,
  emptyMessage,
  className = "",
}: StatTileProps) {
  // Law 02 fix, both branches: the source's ternary is
  // `tone === 'accent' ? 'var(--vt-charcoal-900)' : 'var(--vt-yellow-700)'` — the `else`
  // branch (covering both `default` and `inverse`) is a banned tinted-yellow text/icon
  // colour. `default` becomes a plain charcoal (matches the untinted lead-tile fix
  // ListRow.tsx makes for the same reason); `inverse` becomes `var(--vt-accent)` — full-
  // strength yellow on the charcoal ground, which Law 02 explicitly allows and which
  // ListRow's own inverse icon already uses for the identical reason.
  const glyphColour =
    tone === "accent" ? "var(--vt-charcoal-900)" : tone === "inverse" ? "var(--vt-accent)" : "var(--vt-charcoal-700)";
  const cls = ["vt-stat", tone !== "default" ? `vt-stat--${tone}` : "", className].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      <div className="vt-stat__top">
        <span className="vt-stat__label">{label}</span>
        {icon ? (
          <span className="vt-stat__glyph">
            <Icon name={icon} size={17} color={glyphColour} />
          </span>
        ) : null}
      </div>
      {loading ? (
        <span className="vt-stat__value" aria-busy="true">
          <Icon name="loader-circle" size={16} color="var(--vt-text-muted)" className="vt-stat__spin" />
        </span>
      ) : value == null ? (
        <span className="vt-stat__value vt-stat__value--empty">{emptyMessage}</span>
      ) : (
        // Figures keep their own direction inside Arabic (UI-SPEC's Four-Language
        // Layout Contract, "Must NOT mirror" table names StatTile explicitly).
        <span className="vt-stat__value vt-dir-keep">{value}</span>
      )}
      {foot ? <span className="vt-stat__foot">{foot}</span> : null}
    </div>
  );
}
