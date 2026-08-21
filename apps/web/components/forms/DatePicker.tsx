"use client";

import "./DatePicker.css";
import { useId, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "../core";

// design-system component bundle (reference-only per D-30), function DatePicker
// (components/forms/DatePicker.jsx). No `.dc.html` mock references DatePicker at all
// (confirmed by the usage audit tests/support/mock-harness.ts's
// COMPONENTS_WITHOUT_MOCK_USAGE records) — it is diffed against the vendored bundle
// through the harness's mountBundle entry point in forms.spec.ts instead.

export type DatePickerSize = "sm" | "md" | "lg";

interface DatePickerOwnProps {
  label?: ReactNode;
  value?: string;
  /** Rule 2 addition — the source falls back to the English literal `'Pick a date'`
   * when `value` is empty. All copy is props-driven (I18N-01): the placeholder is
   * now caller-supplied, same shape as Input/Select's own `placeholder`, with no
   * built-in English default. */
  placeholder?: string;
  time?: string;
  times?: string[];
  monthLabel?: ReactNode;
  /**
   * Rule 2 addition — the source hardcodes `['Mo','Tu','We','Th','Fr','Sa','Su']`,
   * an English-abbreviation literal (I18N-01 counts this exactly like visible text).
   * Caller-supplied, Monday-first (matching `firstDow`'s own Monday-first
   * convention), seven entries. An empty array (the default) renders empty weekday
   * cells rather than inventing English abbreviations.
   */
  dowLabels?: string[];
  firstDow?: number;
  daysInMonth?: number;
  selectedDay?: number;
  size?: DatePickerSize;
  hint?: ReactNode;
  /** Rule 2 addition — matrix: "error = invalid/past date". Same error-message shape
   * as Input/Select/Textarea/Counter: replaces the hint, never shown alongside it. */
  error?: ReactNode;
  /** Rule 2 addition — the source has no whole-control disabled concept at all. */
  disabled?: boolean;
  /** Rule 2 addition — see 01-09-PLAN.md's own must_haves ("Only the select and the
   * date picker have a loading state") and 01-UI-SPEC.md's Component Port Fidelity
   * Contract § E3 ("Only Select and DatePicker have a loading state in the matrix");
   * the Component State Matrix's own DatePicker row marks Loading "—", which this
   * plan's explicit, more specific statements override — treated as the matrix row
   * having the stale value, not the two explicit statements. Same spinning-chevron
   * treatment as Select's own Rule 2 loading addition (DatePicker.css). */
  loading?: boolean;
  /** All copy is props-driven — the source hardcodes "Previous month"/"Next month"
   * as English aria-labels; no built-in fallback here. */
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  /** The source falls back to `label || 'Pick a date'` for the popover's own
   * aria-label; ported as an explicit prop with no English fallback — falls back to
   * `label` alone (already caller-translated) when omitted. */
  dialogLabel?: string;
  onChange?: (day: number) => void;
  onTimeChange?: (time: string) => void;
  id?: string;
  className?: string;
}

export type DatePickerProps = DatePickerOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof DatePickerOwnProps>;

export function DatePicker({
  label,
  value = "",
  placeholder,
  time,
  times = ["06:00", "08:15", "10:30", "12:00", "14:30", "17:50", "20:00", "22:15"],
  monthLabel,
  dowLabels = [],
  firstDow = 5,
  daysInMonth = 31,
  selectedDay,
  size = "lg",
  hint,
  error,
  disabled = false,
  loading = false,
  prevMonthLabel,
  nextMonthLabel,
  dialogLabel,
  onChange,
  onTimeChange,
  id,
  className = "",
  ...rest
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const fid = id || generatedId;

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const fieldClass = [
    "vt-dp__field",
    `vt-dp__field--${size}`,
    open ? "vt-dp__field--open" : "",
    error ? "vt-dp__field--error" : "",
    disabled ? "vt-dp__field--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isInteractive = !disabled && !loading;

  return (
    <div className={["vt-dp", className].filter(Boolean).join(" ")} {...rest}>
      {label ? (
        <span className="vt-dp__label" id={fid}>
          {label}
        </span>
      ) : null}
      <button
        type="button"
        className={fieldClass}
        aria-labelledby={label ? fid : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={error ? true : undefined}
        aria-busy={loading || undefined}
        disabled={!isInteractive}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="calendar" size={18} color="var(--vt-text-muted)" />
        {/* Rule 1 fix (bug — I18N-04, found during the Arabic manual pass): a plain
            "14 August 2026" text node inside an ambient dir="rtl" context gets
            reordered by the Unicode bidi algorithm to "August 2026 14" — the day
            number, a weak-directionality run with no strong RTL anchor of its own,
            drifts to the end of the phrase. `.vt-dir-keep` only wraps `time` below
            (a single "08:15" token, too short to visibly reorder) not `value`
            (multi-token, the one that actually broke). Times and dates must both
            stay LTR per the Four-Language Layout Contract — the placeholder itself
            (ordinary translated prose, not a date) is intentionally left outside the
            wrapper so it still follows the reading direction normally. */}
        <span className="vt-dp__value">
          {value ? <span className="vt-dir-keep">{value}</span> : placeholder}
        </span>
        {time ? (
          <span className="vt-dp__time vt-dir-keep">{time}</span>
        ) : null}
        {loading ? (
          <Icon
            name="loader-circle"
            size={16}
            color="var(--vt-text-muted)"
            className="vt-dp__spin"
          />
        ) : (
          <Icon name="chevron-down" size={16} color="var(--vt-text-muted)" />
        )}
      </button>
      {error ? (
        <span className="vt-dp__err">
          <Icon name="triangle-alert" size={13} />
          {error}
        </span>
      ) : hint ? (
        <span className="vt-dp__hint">{hint}</span>
      ) : null}
      {open && isInteractive ? (
        <div
          className="vt-dp__pop"
          role="dialog"
          aria-label={dialogLabel ?? (typeof label === "string" ? label : undefined)}
        >
          <div className="vt-dp__head">
            <button
              type="button"
              className="vt-dp__nav"
              aria-label={prevMonthLabel}
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <span className="vt-dp__month">{monthLabel}</span>
            <button
              type="button"
              className="vt-dp__nav"
              aria-label={nextMonthLabel}
            >
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
          <div className="vt-dp__grid">
            {dowLabels.map((d, i) => (
              <span className="vt-dp__dow" key={`dow-${i}`}>
                {d}
              </span>
            ))}
            {cells.map((d, i) =>
              d == null ? (
                <span className="vt-dp__day vt-dp__day--muted" key={`e${i}`} />
              ) : (
                <button
                  type="button"
                  key={d}
                  onClick={() => {
                    onChange?.(d);
                    setOpen(false);
                  }}
                  className={"vt-dp__day" + (d === selectedDay ? " vt-dp__day--sel" : "")}
                >
                  {d}
                </button>
              ),
            )}
          </div>
          {times.length ? (
            <div className="vt-dp__times">
              {times.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => {
                    onTimeChange?.(t);
                    setOpen(false);
                  }}
                  className={"vt-dp__slot" + (t === time ? " vt-dp__slot--sel" : "")}
                >
                  <span className="vt-dir-keep">{t}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
