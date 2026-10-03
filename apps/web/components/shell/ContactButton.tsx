"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, IconButton } from "@/components/core";
import {
  CONTACT_CHANNELS,
  CYCLE_MS,
  HIDE_FLAGS,
  PHONE_QUERY,
  isTextField,
  triggerLabelKey,
} from "@/lib/contact-button";
import { ContactRow } from "./ContactRow";
import "./ContactButton.css";

/** The three channels the float shows in turn (WhatsApp, Call us, Email); labels reuse the menu row titles. */
const CYCLE_CHANNELS = CONTACT_CHANNELS.slice(0, 3).map((c) => ({ id: c.id, icon: c.icon, titleKey: c.titleKey }));

export type ContactButtonProps = {
  /** `float`: fixed bottom inline-end on every Next page. `docked`: inside a bottom bar (the checkout PAY bar). */
  variant?: "float" | "docked";
};

/**
 * The one way to reach a person (261003, owner-signed direction B). React twin of
 * app/{home,pages}/ContactButton.dc.html; the Next pages (/checkout, /checkout/pay/[token],
 * /confirmation, /review, the error pages) mount it through SiteShell, the PAY bar docks it.
 *
 * Above 680px the float is a charcoal CONTACT pill and the menu a card above it; at 680px and
 * below it is a 54px disc and the menu a bottom sheet (modal, focus kept inside). Esc, a tap
 * outside, the close button or following a row close the menu; focus goes back to the button.
 * The float is one button that moves by itself: it rests closed, widens to show a channel
 * (WhatsApp, Call us, Email, in turn), closes again. It stands still while the menu is open, the
 * pointer is on it, the tab is hidden or reduced motion is on. While the footer reaches it, it
 * takes the brand-yellow ground (IntersectionObserver, no scroll handler).
 * The float steps aside (CSS, ContactButton.css) while the cookie card is open on a phone,
 * while a text field has focus on a phone, and whenever a docked button is on the page.
 */
export function ContactButton({ variant = "float" }: ContactButtonProps) {
  const t = useTranslations("contactButton");
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [kb, setKb] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [ph, setPh] = useState<"closed" | "open" | "closing">("closed");
  const [ci, setCi] = useState(-1);
  const [reduced, setReduced] = useState(false);
  const [still, setStill] = useState(false);
  const [over, setOver] = useState(false);
  const [innerW, setInnerW] = useState(0);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const uid = useId().replace(/:/g, "");
  const menuId = `vt-cb-${uid}-menu`;
  const titleId = `vt-cb-${uid}-title`;

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia(PHONE_QUERY);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Reduced motion and a hidden tab stop the cycle.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduced(mq.matches);
      if (mq.matches) setPh("closed");
    };
    const vis = () => setStill(document.hidden);
    sync();
    mq.addEventListener("change", sync);
    document.addEventListener("visibilitychange", vis);
    return () => {
      mq.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  // closed -> open (next channel) -> closing -> closed.
  useEffect(() => {
    if (variant !== "float" || open || reduced || still) return;
    const next =
      ph === "closed"
        ? () => {
            setCi((i) => (i + 1) % CYCLE_CHANNELS.length);
            setPh("open");
          }
        : ph === "open"
          ? () => setPh("closing")
          : () => setPh("closed");
    const id = setTimeout(next, ph === "closed" ? CYCLE_MS.rest : ph === "open" ? CYCLE_MS.show : CYCLE_MS.close);
    return () => clearTimeout(id);
  }, [variant, open, reduced, still, ph]);

  // The button animates between the disc and the width of icon + label.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.ceil(el.getBoundingClientRect().width);
      if (w) setInnerW(w);
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant]);

  // Over the footer: a 2px band through the middle of the button; while the footer crosses it
  // the button takes the brand-yellow ground.
  useEffect(() => {
    if (variant !== "float" || typeof IntersectionObserver !== "function") return;
    let io: IntersectionObserver | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const setup = () => {
      io?.disconnect();
      const f = document.querySelector('footer[data-screen-label="Footer"], body > footer, footer');
      if (!f) {
        if (++tries < 20) retry = setTimeout(setup, 500);
        return;
      }
      const vh = window.innerHeight || 0;
      const mid = vh - (narrow ? 16 : 24) - 27;
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1];
          if (e) setOver(e.isIntersecting);
        },
        { rootMargin: `-${Math.max(0, mid - 1)}px 0px -${Math.max(0, vh - mid - 1)}px 0px`, threshold: 0 },
      );
      io.observe(f);
    };
    setup();
    window.addEventListener("resize", setup);
    return () => {
      clearTimeout(retry);
      io?.disconnect();
      window.removeEventListener("resize", setup);
    };
  }, [variant, narrow]);

  // A docked button (the PAY bar) replaces the float on the page.
  useEffect(() => {
    if (variant !== "docked") return;
    const root = document.documentElement;
    root.setAttribute(HIDE_FLAGS.docked, "1");
    return () => {
      root.removeAttribute(HIDE_FLAGS.docked);
    };
  }, [variant]);

  // Keyboard up on a phone: a text field outside this component has focus.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onIn = (e: FocusEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      if (isTextField(e.target as Element)) setKb(true);
    };
    const onOut = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setKb(isTextField(document.activeElement)), 0);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  const focusTrigger = useCallback(() => {
    const triggers = rootRef.current?.querySelectorAll<HTMLElement>("[data-cb-trigger]") ?? [];
    const shown = Array.from(triggers).find((n) => n.getClientRects().length > 0);
    shown?.focus({ preventScroll: true });
  }, []);

  const close = useCallback(
    (restore: boolean) => {
      setOpen(false);
      if (restore) setTimeout(focusTrigger, 0);
    },
    [focusTrigger],
  );

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    const inside = (n: EventTarget | null) =>
      !!n && ((rootRef.current?.contains(n as Node) ?? false) || (panelRef.current?.contains(n as Node) ?? false));
    let outTimer: ReturnType<typeof setTimeout> | undefined;
    const onDown = (e: PointerEvent) => {
      if (inside(e.target)) return;
      setOpen(false);
      clearTimeout(outTimer);
      outTimer = setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body || a === document.documentElement) focusTrigger();
      }, 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(outTimer);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, focusTrigger]);

  // The phone sheet is modal: Tab and Shift+Tab stay inside it.
  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !narrow) return;
    const box = panelRef.current;
    if (!box) return;
    const f = Array.from(box.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")).filter(
      (n) => n.getClientRects().length > 0,
    );
    if (!f.length) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    const a = document.activeElement;
    if (e.shiftKey && (a === first || a === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && a === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const toggle = () => {
    if (open) close(true);
    else {
      setPh("closed");
      setOpen(true);
    }
  };
  const follow = () => close(true);
  const label = t(triggerLabelKey(open));
  const icon = open ? "x" : "message-circle";
  const live = !open && !reduced;
  const expanded = live && ph === "open";
  const keep = live && (narrow ? ph !== "closed" : ph === "open");
  const ch = CYCLE_CHANNELS[Math.max(0, ci)]!;
  const isWa = keep && ch.id === "whatsapp";
  const floatIcon = open ? "x" : keep ? ch.icon : "message-circle";
  const floatLabel = open ? t("close") : keep ? t(ch.titleKey) : t("contact");
  const fullW = innerW ? 16 + innerW + 24 : 0;
  const floatW = !narrow || expanded ? fullW : 54;
  const aria = {
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    "data-cb-trigger": "1",
  };

  const rows = (size: "card" | "sheet") => (
    <ul className="vt-cbtn__rows">
      {CONTACT_CHANNELS.map((c) => (
        <li key={c.id}>
          <ContactRow
            icon={c.icon}
            logo={c.logo}
            title={t(c.titleKey)}
            sub={c.sub ?? (c.subKey ? t(c.subKey) : undefined)}
            keep={!!c.sub}
            href={c.href ?? undefined}
            internalHref={c.href ? undefined : "/contact"}
            newTab={c.newTab}
            endIcon={c.endIcon}
            size={size}
            onFollow={follow}
          />
        </li>
      ))}
    </ul>
  );

  const head = (withClose: boolean) => (
    <div className="vt-cbtn__head">
      <div>
        <p className="vt-cbtn__kick">{t("contact")}</p>
        <p className="vt-cbtn__title" id={titleId}>
          {t("talk")}
        </p>
      </div>
      {withClose ? (
        <IconButton icon="x" label={t("close")} variant="outline" size="md" onClick={() => close(true)} data-cb-x="1" />
      ) : null}
    </div>
  );

  const sheet =
    open && narrow && mounted
      ? createPortal(
          <div className="vt-cbtn__layer" data-contact-sheet="1">
            <div className="vt-cbtn__scrim" aria-hidden="true" onClick={() => close(true)} />
            <div
              className="vt-cbtn__sheet"
              id={menuId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              ref={panelRef}
              onKeyDown={trap}
            >
              <div className="vt-cbtn__grab" aria-hidden="true" />
              {head(true)}
              {rows("sheet")}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`vt-cbtn vt-cbtn--${variant}`}
      ref={rootRef}
      data-contact-btn="1"
      data-variant={variant}
      data-open={open ? "1" : "0"}
      data-kb={kb ? "1" : "0"}
      onPointerEnter={(e) => e.pointerType === "mouse" && setStill(true)}
      onPointerLeave={() => setStill(document.hidden)}
    >
      {variant === "docked" ? (
        <IconButton icon={icon} label={label} variant="outline" size="lg" onClick={toggle} {...aria} data-cb-dock="1" />
      ) : (
        <>
          <button
            type="button"
            className="vt-cbtn__float"
            aria-label={label}
            onClick={toggle}
            data-x={expanded ? "1" : "0"}
            data-over={over ? "1" : "0"}
            data-ch={keep ? ch.id : ""}
            style={floatW ? { inlineSize: `${floatW}px` } : undefined}
            {...aria}
          >
            <span className="vt-cbtn__inner" ref={innerRef}>
              <span className="vt-cbtn__ico" aria-hidden="true">
                {isWa ? (
                  <span className="vt-cbtn__wa" />
                ) : (
                  <Icon name={floatIcon} size={22} color={over ? "var(--vt-charcoal-900)" : "var(--vt-yellow)"} />
                )}
              </span>
              <span className="vt-cbtn__lbl" aria-hidden="true">
                {floatLabel}
              </span>
            </span>
          </button>
        </>
      )}
      {open && !narrow ? (
        <div
          className="vt-cbtn__panel"
          id={menuId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          ref={panelRef}
        >
          {head(false)}
          {rows("card")}
        </div>
      ) : null}
      {sheet}
    </div>
  );
}
