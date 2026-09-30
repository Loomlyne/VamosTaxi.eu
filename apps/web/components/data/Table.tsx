import "./Table.css";
import type { ReactNode } from "react";
import { Icon } from "../core";

// design-system component bundle (reference-only per D-30), function Table
// (components/data/Table.jsx, `design-system/_ds_bundle.js:43636-43665`). Pure
// presentational table over `columns`/`rows` props — it fetches nothing (01-PATTERNS.md).
//
// `data-selected` (not a `.vt-table--selected` class) is the source's own
// selection mechanism, preserved verbatim — Table.css keys off this exact attribute.
export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  width?: string;
  align?: "left" | "right";
  render?: (row: Row) => ReactNode;
}

export interface TableProps<Row extends Record<string, unknown> = Record<string, unknown>> {
  columns: TableColumn<Row>[];
  rows: Row[];
  onRowClick?: (row: Row) => void;
  selectedId?: string | number | null;
  rowKey?: string;
  /** Rule 2 addition — the compiled source's `function Table` signature has no
   * loading/error/empty concept at all (confirmed by reading the source directly); the
   * UI-SPEC's own Component State Matrix marks all three regardless, "ported now so the
   * state exists" ahead of Phase 2/3's real queries. */
  loading?: boolean;
  /** No built-in English fallback — same "caller supplies, the dictionary resolves at
   * the call site" pattern 01-09-SUMMARY.md established for Counter's aria-labels and
   * DatePicker's weekday/placeholder strings (I18N-01 treats a hardcoded default as a
   * violation regardless of how reasonable the English reads). */
  loadingLabel?: ReactNode;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  className?: string;
}

export function Table<Row extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  rows,
  onRowClick,
  selectedId = null,
  rowKey = "id",
  loading = false,
  loadingLabel,
  error,
  emptyMessage,
  className = "",
}: TableProps<Row>) {
  const colSpan = columns.length || 1;

  return (
    // The narrow-viewport horizontal-scroll region owns its own scroll.
    <div className={["vt-tablewrap", className].filter(Boolean).join(" ")}>
      <table className={"vt-table" + (onRowClick ? " vt-table--rows" : "")}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={c.align === "right" ? "vt-table__num" : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {error ? (
            <tr>
              <td className="vt-table__state vt-table__state--error" colSpan={colSpan}>
                <Icon name="triangle-alert" size={14} color="var(--vt-danger)" />
                {error}
              </td>
            </tr>
          ) : loading ? (
            <tr>
              <td className="vt-table__state" colSpan={colSpan} aria-busy="true">
                <Icon name="loader-circle" size={16} color="var(--vt-text-muted)" className="vt-table__spin" />
                {loadingLabel}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className="vt-table__state" colSpan={colSpan}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={String(r[rowKey])}
                data-selected={selectedId != null && r[rowKey] === selectedId}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "vt-table__num" : undefined}>
                    {c.render ? c.render(r) : (r[c.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
