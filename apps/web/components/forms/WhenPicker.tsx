"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/core";
import "./WhenPicker.css";

export const WHEN_PICKER_TIMES = [
  "05:30",
  "06:45",
  "08:15",
  "09:30",
  "11:00",
  "12:15",
  "14:00",
  "16:30",
  "18:45",
  "21:15",
];

export type WhenPickerProps = {
  label: string;
  placeholder: string;
  date?: string;
  time?: string;
  date2?: string;
  time2?: string;
  range?: boolean;
  /** Calendar only — time is a sibling field (checkout trip). */
  hideTime?: boolean;
  times?: string[];
  locale?: string;
  groups?: [string, string, string];
  legLabels?: [string, string];
  timeTitle?: string;
  timeTitle2?: string;
  savedLabel?: string;
  clearLabel?: string;
  saveLabel?: string;
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  hint?: string;
  onDateChange?: (iso: string) => void;
  onTimeChange?: (time: string) => void;
  onDate2Change?: (iso: string) => void;
  onTime2Change?: (time: string) => void;
  onClear?: () => void;
  onOpenChange?: (open: boolean) => void;
};

type Rect = { top: number; bottom: number; left: number; right: number };

function parseIso(iso: string | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function locTag(locale: string) {
  return locale === "en" ? "en-GB" : locale;
}

function fmt(locale: string, opts: Intl.DateTimeFormatOptions, d: Date) {
  try {
    return new Intl.DateTimeFormat(locTag(locale), opts).format(d);
  } catch {
    return "";
  }
}

function dayLabel(locale: string, y: number, m: number, d: number) {
  return fmt(locale, { weekday: "short", day: "numeric", month: "short" }, new Date(y, m, d)).replace(
    /,/g,
    "",
  );
}

export function WhenPicker({
  label,
  placeholder,
  date = "",
  time = "",
  date2 = "",
  time2 = "",
  range = false,
  hideTime = false,
  times = WHEN_PICKER_TIMES,
  locale = "en",
  groups = ["Morning", "Afternoon", "Evening"],
  legLabels = ["Pickup", "Return"],
  timeTitle = "Pickup time",
  timeTitle2 = "Return time",
  savedLabel = "Saved",
  clearLabel = "Clear",
  saveLabel = "Save",
  prevMonthLabel = "Previous month",
  nextMonthLabel = "Next month",
  hint,
  onDateChange,
  onTimeChange,
  onDate2Change,
  onTime2Change,
  onClear,
  onOpenChange,
}: WhenPickerProps) {
  const parsed = parseIso(date);
  const parsed2 = parseIso(date2);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [leg, setLeg] = useState(0);
  const [viewY, setViewY] = useState(parsed?.y ?? now.getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? now.getMonth());
  const [rect, setRect] = useState<Rect | null>(null);
  const [popH, setPopH] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const fid = useId();

  const setOpenState = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (next) {
      setLeg(0);
      setPopH(0);
      const el = rootRef.current?.querySelector<HTMLElement>("button[aria-haspopup='dialog']");
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenState(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenState(false);
    };
    const repos = () => {
      const el = rootRef.current?.querySelector<HTMLElement>("button[aria-haspopup='dialog']");
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", repos, true);
    window.addEventListener("resize", repos);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", repos, true);
      window.removeEventListener("resize", repos);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !popRef.current) return;
    const h = popRef.current.offsetHeight;
    if (h && h !== popH) setPopH(h);
  }, [open, popH, range, leg]);

  const shift = (n: number) => {
    const d = new Date(viewY, viewM + n, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  const first = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
  const dim = new Date(viewY, viewM + 1, 0).getDate();
  const dows: string[] = [];
  for (let i = 0; i < 7; i++) dows.push(fmt(locale, { weekday: "short" }, new Date(2024, 0, 1 + i)));

  const d1 = parsed?.d ?? 0;
  const d2 = parsed2?.d ?? 0;
  const on1 = parsed != null && viewY === parsed.y && viewM === parsed.m;
  const on2 = range && parsed2 != null && viewY === parsed2.y && viewM === parsed2.m;
  const lo = Math.min(d1, d2);
  const hi = Math.max(d1, d2);

  const pickDay = (d: number) => {
    const iso = toIso(viewY, viewM, d);
    if (range && leg === 1) onDate2Change?.(iso);
    else {
      onDateChange?.(iso);
      if (range) setLeg(1);
    }
  };

  const activeTime = leg === 1 ? time2 : time;
  const timeRows: Array<{ kind: "head" | "plain" | "sel"; label: string }> = [];
  let lastG = -1;
  times.forEach((tm) => {
    const hr = Number(String(tm).split(":")[0]);
    const g = hr < 12 ? 0 : hr < 17 ? 1 : 2;
    if (g !== lastG) {
      timeRows.push({ kind: "head", label: groups[g] ?? "" });
      lastG = g;
    }
    timeRows.push({ kind: tm === activeTime ? "sel" : "plain", label: tm });
  });

  const pickTime = (tm: string) => {
    if (range && leg === 1) onTime2Change?.(tm);
    else if (range) {
      onTimeChange?.(tm);
      setLeg(1);
    } else onTimeChange?.(tm);
  };

  const full1 = parsed ? dayLabel(locale, parsed.y, parsed.m, parsed.d) : "";
  const full2 = parsed2 ? dayLabel(locale, parsed2.y, parsed2.m, parsed2.d) : "";
  const short = (v: string) => v.replace(/^\S+\s/, "");
  const saved = range ? !!(full1 && time && full2 && time2) : hideTime ? !!full1 : !!(full1 && time);
  const isEmpty = hideTime ? !full1 : !full1 && !time;
  const titles = [timeTitle, timeTitle2];
  const stamps = [`${full1} · ${time}`, `${full2} · ${time2}`];

  const popStyle = ((): CSSProperties => {
    if (typeof window === "undefined" || !rect) {
      return {
        position: "absolute",
        insetInlineStart: 0,
        top: "calc(100% + 8px)",
        width: "min(560px, calc(100vw - 40px))",
        maxHeight: "min(70svh, 540px)",
      };
    }
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;
    const w = Math.min(560, vw - 24);
    const left = Math.round(Math.min(Math.max(12, rect.left), Math.max(12, vw - w - 12)));
    const need = popH || (range ? 520 : 460);
    const below = vh - rect.bottom - 10;
    const above = rect.top - 10;
    const up = below < need && above > below;
    const room = Math.max(240, Math.floor(up ? above : below));
    return {
      position: "fixed",
      left,
      ...(up ? { bottom: Math.round(vh - rect.top + 8) } : { top: Math.round(rect.bottom + 8) }),
      width: w,
      maxHeight: room,
    };
  })();

  return (
    <div ref={rootRef} className="vt-when" data-whenpicker="1" data-date-only={hideTime ? "1" : undefined}>
      <span className="vt-when__label" id={fid}>
        {label}
      </span>
      <div className="vt-when__wrap">
        <button
          type="button"
          className="vt-when__field"
          aria-labelledby={fid}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-test-field="when"
          onClick={() => setOpenState(!open)}
        >
          <Icon name="calendar" size={16} color="var(--vt-text-muted)" />
          <span className="vt-when__value">
            {isEmpty ? (
              <span className="vt-when__ph">{placeholder}</span>
            ) : (
              <>
                <span className="vt-dir-keep">{range ? short(full1) : full1}</span>
                {!hideTime && time ? <span className="vt-when__time vt-dir-keep">{time}</span> : null}
                {range ? (
                  <>
                    <span className="vt-when__arrow">→</span>
                    <span className="vt-dir-keep">{short(full2)}</span>
                    {time2 ? <span className="vt-when__time vt-dir-keep">{time2}</span> : null}
                  </>
                ) : null}
              </>
            )}
          </span>
          <Icon name="chevron-down" size={16} color="var(--vt-text-muted)" />
        </button>
        {open ? (
          <div
            ref={popRef}
            className="vt-when__pop"
            role="dialog"
            aria-label={label}
            style={popStyle}
          >
            {range ? (
              <div className="vt-when__legs" role="tablist">
                {legLabels.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={leg === i}
                    className={leg === i ? "vt-when__leg vt-when__leg--on" : "vt-when__leg"}
                    onClick={() => setLeg(i)}
                  >
                    {name}
                    <span>{i === 0 ? time : time2}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div data-wp-row="">
              <div data-wp-cal="">
                <div className="vt-when__month">
                  <button type="button" aria-label={prevMonthLabel} onClick={() => shift(-1)}>
                    <Icon name="chevron-left" size={16} color="currentColor" />
                  </button>
                  <span>{fmt(locale, { month: "long", year: "numeric" }, new Date(viewY, viewM, 1))}</span>
                  <button type="button" aria-label={nextMonthLabel} onClick={() => shift(1)}>
                    <Icon name="chevron-right" size={16} color="currentColor" />
                  </button>
                </div>
                <div className="vt-when__grid">
                  {dows.map((w) => (
                    <span key={w} className="vt-when__dow">
                      {w}
                    </span>
                  ))}
                  {Array.from({ length: first }, (_, i) => (
                    <span key={`b${i}`} />
                  ))}
                  {Array.from({ length: dim }, (_, i) => {
                    const d = i + 1;
                    const sel = (d1 > 0 && on1 && d === d1) || (on2 && d === d2);
                    const tween = !sel && range && on1 && on2 && d2 > 0 && d > lo && d < hi;
                    const cls = sel
                      ? "vt-when__day vt-when__day--sel"
                      : tween
                        ? "vt-when__day vt-when__day--tween"
                        : "vt-when__day";
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={sel || undefined}
                        className={cls}
                        onClick={() => pickDay(d)}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              {hideTime ? null : (
                <>
                  <div data-wp-div="" />
                  <div data-wp-time="">
                    <div className="vt-when__timehead">
                      <Icon name="clock" size={16} color="var(--vt-text-muted)" />
                      <span>{titles[leg]}</span>
                    </div>
                    <div className="vt-when__slots">
                      {timeRows.map((r, i) =>
                        r.kind === "head" ? (
                          <span key={`h${i}`} className="vt-when__ghead">
                            {r.label}
                          </span>
                        ) : (
                          <button
                            key={r.label}
                            type="button"
                            aria-pressed={r.kind === "sel" || undefined}
                            className={
                              r.kind === "sel" ? "vt-when__slot vt-when__slot--sel" : "vt-when__slot"
                            }
                            onClick={() => pickTime(r.label)}
                          >
                            <span className="vt-dir-keep">{r.label}</span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            {range ? (
              <div className="vt-when__summary vt-when__summary--range">
                {legLabels.map((name, i) => {
                  const on = leg === i;
                  const stamp = stamps[i];
                  return on ? (
                    <span key={name} className="vt-when__chip vt-when__chip--on">
                      <span>{name}</span>
                      <strong className="vt-dir-keep">{stamp}</strong>
                    </span>
                  ) : (
                    <button
                      key={name}
                      type="button"
                      className="vt-when__chip"
                      onClick={() => setLeg(i)}
                    >
                      <span>{name}</span>
                      <strong className="vt-dir-keep">{stamp}</strong>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="vt-when__summary">
                <span className="vt-when__sumcopy">
                  <span>{label}</span>
                  <strong className="vt-dir-keep">{hideTime ? full1 : `${full1} · ${time}`}</strong>
                </span>
              </div>
            )}
            <div className="vt-when__actions">
              <button
                type="button"
                className="vt-when__clear"
                onClick={() => {
                  setLeg(0);
                  onClear?.();
                }}
              >
                <Icon name="x" size={14} color="currentColor" />
                {clearLabel}
              </button>
              <button
                type="button"
                className={saved ? "vt-when__save vt-when__save--done" : "vt-when__save"}
                onClick={() => setOpenState(false)}
              >
                {saved ? <Icon name="check" size={14} color="var(--vt-accent)" /> : null}
                {saved ? savedLabel : saveLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {hint ? <span className="vt-when__hint">{hint}</span> : null}
    </div>
  );
}
