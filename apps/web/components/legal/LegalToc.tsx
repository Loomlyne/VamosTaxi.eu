"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/core";
import type { LegalSection } from "./LegalPage";

export function LegalToc({ sections }: { sections: LegalSection[] }) {
  const tLegal = useTranslations("legal");
  const tCommon = useTranslations("common");
  const tOps = useTranslations("ops");
  const tCookies = useTranslations("cookies");
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0 || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      () => {
        let current = headings[0]?.id ?? "";
        for (const el of headings) {
          if (el.getBoundingClientRect().top <= 140) current = el.id;
        }
        setActive(current);
      },
      { rootMargin: "-104px 0px -60% 0px" },
    );
    headings.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function title(key: string): string {
    if (key.startsWith("common.")) return tCommon(key.slice(7));
    if (key.startsWith("ops.")) return tOps(key.slice(4));
    if (key.startsWith("legal.")) return tLegal(key.slice(6));
    if (key.startsWith("cookies.")) return tCookies(key.slice(8));
    return tLegal(key);
  }

  return (
    <aside data-lg-rail="1" data-lg-noprint="1" aria-label={tLegal("page-navigation")}>
      <button
        data-lg-tocbtn="1"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{tLegal("on-this-page")}</span>
        <Icon name="chevron-down" size={18} color="var(--vt-charcoal-900)" />
      </button>
      <nav
        id={panelId}
        data-lg-toc="1"
        data-lg-railcard="1"
        data-open={open ? "1" : undefined}
        aria-label={tCommon("sections")}
      >
        <p data-lg-eyebrow="1">{tLegal("on-this-page")}</p>
        <div className="vt-legal-toc-list">
          {sections.map((s) => (
            <a
              key={s.id}
              data-lg-tl="1"
              data-on={active === s.id ? "1" : undefined}
              href={`#${s.id}`}
              aria-current={active === s.id ? "location" : undefined}
              onClick={() => setOpen(false)}
            >
              <i>{s.number}</i>
              {title(s.titleKey)}
            </a>
          ))}
        </div>
      </nav>
    </aside>
  );
}
