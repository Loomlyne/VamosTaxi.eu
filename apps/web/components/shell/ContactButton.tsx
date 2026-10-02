"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Icon, IconButton } from "@/components/core";
import {
  CONTACT_CHANNELS,
  HIDE_FLAGS,
  PHONE_QUERY,
  isTextField,
  triggerLabelKey,
} from "@/lib/contact-button";
import { ContactRow } from "./ContactRow";
import "./ContactButton.css";

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
 * The float steps aside (CSS, ContactButton.css) while the cookie card is open on a phone,
 * while a text field has focus on a phone, and whenever a docked button is on the page.
 */
export function ContactButton({ variant = "float" }: ContactButtonProps) {
  const t = useTranslations("contactButton");
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [kb, setKb] = useState(false);
  const [mounted, setMounted] = useState(false);
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

  const toggle = () => (open ? close(true) : setOpen(true));
  const follow = () => close(true);
  const label = t(triggerLabelKey(open));
  const icon = open ? "x" : "message-circle";
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
    >
      {variant === "docked" ? (
        <IconButton icon={icon} label={label} variant="outline" size="lg" onClick={toggle} {...aria} data-cb-dock="1" />
      ) : (
        <>
          <Button variant="secondary" size="lg" className="vt-cbtn__pill" aria-label={label} onClick={toggle} {...aria}>
            <Icon name={icon} size={20} color="var(--vt-yellow)" />
            <span>{open ? t("close") : t("contact")}</span>
          </Button>
          <button type="button" className="vt-cbtn__disc" aria-label={label} onClick={toggle} {...aria}>
            <Icon name={icon} size={22} color="var(--vt-yellow)" />
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
