"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { Icon, Logo } from "@/components/core";
import { routing } from "@/i18n/routing";
import {
  PHONE_DISPLAY,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
  WHATSAPP_HREF,
} from "@/lib/contact-channels";
import "./ContactFab.css";

const { Link } = createNavigation(routing);

export function ContactFab() {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="vt-contact-fab" ref={rootRef} data-vt-fab="1">
      {open ? (
        <div className="vt-contact-fab__panel" id={panelId} role="menu">
          <a className="vt-contact-fab__item" href={SUPPORT_EMAIL_HREF} role="menuitem">
            <Icon name="mail" size={16} />
            <span className="vt-dir-keep">{SUPPORT_EMAIL}</span>
          </a>
          <Link className="vt-contact-fab__item" href="/contact" role="menuitem">
            <Icon name="message-circle" size={16} />
            {t("contact")}
          </Link>
          <a
            className="vt-contact-fab__item"
            href={WHATSAPP_HREF}
            role="menuitem"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="phone" size={16} />
            <span className="vt-dir-keep">{PHONE_DISPLAY}</span>
          </a>
        </div>
      ) : null}
      <button
        type="button"
        className="vt-contact-fab__btn"
        aria-label={t("contact")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Logo form="mark" height={22} />
      </button>
    </div>
  );
}
