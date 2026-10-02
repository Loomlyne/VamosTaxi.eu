"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/core";
import { bumpHm, parseHm } from "@/lib/checkout/hm";
import "./TimePicker.css";

export function TimePicker({
  label,
  timeTitle,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  timeTitle: string;
  value: string;
  placeholder: string;
  onChange: (hm: string) => void;
}) {
  const fid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const repos = () => setRect(rootRef.current?.querySelector("button")?.getBoundingClientRect() ?? null);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", repos, true);
    window.addEventListener("resize", repos);
    repos();
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", repos, true);
      window.removeEventListener("resize", repos);
    };
  }, [open]);

  const parsed = parseHm(value || "08:00");
  const shown = value ? parsed.hm : "";

  const popStyle = ((): CSSProperties => {
    if (typeof window === "undefined" || !rect) {
      return {
        position: "absolute",
        insetInlineStart: 0,
        top: "calc(100% + 8px)",
        width: "min(280px, calc(100vw - 40px))",
      };
    }
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;
    const w = Math.min(280, vw - 24);
    const left = Math.round(Math.min(Math.max(12, rect.left), Math.max(12, vw - w - 12)));
    const below = vh - rect.bottom - 10;
    const up = below < 260 && rect.top - 10 > below;
    return {
      position: "fixed",
      left,
      ...(up ? { bottom: Math.round(vh - rect.top + 8) } : { top: Math.round(rect.bottom + 8) }),
      width: w,
    };
  })();

  return (
    <div ref={rootRef} className="vt-time" data-timepicker="1">
      <span className="vt-time__label" id={fid}>
        {label}
      </span>
      <div className="vt-time__wrap">
        <button
          type="button"
          className="vt-time__field"
          aria-labelledby={fid}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-test-field="time"
          onClick={() => {
            setRect(rootRef.current?.querySelector("button")?.getBoundingClientRect() ?? null);
            setOpen((v) => !v);
          }}
        >
          <Icon name="clock" size={16} color="var(--vt-text-muted)" />
          <span className="vt-time__value">
            {shown ? (
              <span className="vt-dir-keep">{shown}</span>
            ) : (
              <span className="vt-time__ph">{placeholder}</span>
            )}
          </span>
          <Icon name="chevron-down" size={16} color="var(--vt-text-muted)" />
        </button>
        {open ? (
          <div ref={popRef} className="vt-time__pop" role="dialog" aria-label={label} style={popStyle}>
            <div className="vt-time__head">
              <Icon name="clock" size={16} color="var(--vt-text-muted)" />
              <span>{timeTitle}</span>
            </div>
            {/* The hour and minute columns each keep their own digits LTR, but the row
                holding them inherits the page direction — under dir="rtl" the two columns
                swapped and 04:30 painted as "30 : 04". .vt-dir-keep sets direction:ltr,
                which is what fixes a flex row's order. The .dc.html twin carries the same
                fix (shipped by the booking-pages-polish job). */}
            <div className="vt-time__spin vt-dir-keep">
              <div className="vt-time__col">
                <button type="button" aria-label="Hour up" onClick={() => onChange(bumpHm(parsed.hm, 60))}>
                  <Icon name="chevron-up" size={16} color="currentColor" />
                </button>
                <span className="vt-dir-keep">{parsed.hm.slice(0, 2)}</span>
                <button type="button" aria-label="Hour down" onClick={() => onChange(bumpHm(parsed.hm, -60))}>
                  <Icon name="chevron-down" size={16} color="currentColor" />
                </button>
              </div>
              <span className="vt-time__colon" aria-hidden="true">
                :
              </span>
              <div className="vt-time__col">
                <button type="button" aria-label="Minute up" onClick={() => onChange(bumpHm(parsed.hm, 5))}>
                  <Icon name="chevron-up" size={16} color="currentColor" />
                </button>
                <span className="vt-dir-keep">{parsed.hm.slice(3)}</span>
                <button type="button" aria-label="Minute down" onClick={() => onChange(bumpHm(parsed.hm, -5))}>
                  <Icon name="chevron-down" size={16} color="currentColor" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
