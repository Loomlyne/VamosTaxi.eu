// apps/web/components/legal/LegalPage.tsx
//
// Ported from app/pages/terms.dc.html shell (hero, meta, grid, print).
// Shared by terms/privacy/cookies/cancellation/imprint.

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { LEGAL_LANGUAGES, type LegalPageId } from "@/lib/legal-languages";
import { LegalPrintButton } from "./LegalPrintButton";
import { LegalToc } from "./LegalToc";
import { PendingSlot } from "./PendingSlot";
import "./LegalPage.css";

const { Link } = createNavigation(routing);

export type LegalSection = { id: string; number: string; titleKey: string };

const NATIVE_LANG: Record<string, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  ar: "العربية",
};

export async function LegalPage({
  page,
  sections,
  titleKey,
  standfirstKey,
  kickerKey,
  effectiveDateLabel,
  versionLabel,
  children,
}: {
  page: LegalPageId;
  sections: LegalSection[];
  titleKey: string;
  standfirstKey: string;
  kickerKey: string;
  effectiveDateLabel: string;
  versionLabel: string;
  children: ReactNode;
}) {
  const tLegal = await getTranslations("legal");
  const tCommon = await getTranslations("common");
  const tCookies = await getTranslations("cookies");
  const langs = LEGAL_LANGUAGES[page];

  function msg(key: string): string {
    if (key.startsWith("common.")) return tCommon(key.slice("common.".length));
    if (key.startsWith("legal.")) return tLegal(key.slice("legal.".length));
    if (key.startsWith("cookies.")) return tCookies(key.slice("cookies.".length));
    return tLegal(key);
  }

  return (
    <main>
      <header data-lg-hero="1">
        <div className="vt-legal-hero-pattern" aria-hidden="true" />
        <div className="vt-legal-hero-inner">
          <nav aria-label={tCommon("breadcrumb")} className="vt-legal-crumb">
            <Link href="/">{tCommon("home")}</Link>
            <span aria-hidden="true">/</span>
            <span>{tCommon("legal")}</span>
            <span aria-hidden="true">/</span>
            <span>{msg(titleKey)}</span>
          </nav>
          <p className="vt-legal-kicker">{msg(kickerKey)}</p>
          <h1>{msg(titleKey)}</h1>
          <p className="vt-legal-standfirst">{msg(standfirstKey)}</p>
          <div className="vt-legal-meta">
            <div>
              <span>{tLegal("last-updated")}</span>
              <PendingSlot label={effectiveDateLabel} />
            </div>
            <div>
              <span>{tLegal("version")}</span>
              <PendingSlot label={versionLabel} />
            </div>
            <div>
              <span>{tCommon("language")}</span>
              <span data-i18n-skip>{langs.map((c) => NATIVE_LANG[c]).join(" · ")}</span>
            </div>
            <LegalPrintButton label={tLegal("print-or-save-as-pdf")} />
          </div>
        </div>
      </header>

      <div className="vt-legal-body">
        <div data-lg-grid="1">
          <LegalToc sections={sections} />
          <article data-lg-prose="1">
            {children}
          </article>
        </div>
      </div>
    </main>
  );
}
