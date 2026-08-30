// apps/web/components/legal/LanguageCoverageNotice.tsx
//
// I18N-08: a page that exists in fewer than four languages says so, in the
// visitor's language. Declared constant, rendered server-side — never a
// runtime detector. Returns null when the active locale is inside the set.
// Law 02: no tinted Alert/Badge. Law 01: no coloured glow.

import { getLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { Icon } from "@/components/core";
import { routing, type Locale } from "@/i18n/routing";
import { LEGAL_LANGUAGES, type LegalPageId } from "@/lib/legal-languages";
import "./LanguageCoverageNotice.css";

const { Link } = createNavigation(routing);

const LANG_KEY: Record<Locale, "lang-en" | "lang-de" | "lang-fr" | "lang-ar"> = {
  en: "lang-en",
  de: "lang-de",
  fr: "lang-fr",
  ar: "lang-ar",
};

const PAGE_HREF: Record<LegalPageId, `/${LegalPageId}`> = {
  terms: "/terms",
  privacy: "/privacy",
  cookies: "/cookies",
  cancellation: "/cancellation",
  imprint: "/imprint",
};

export async function LanguageCoverageNotice({ page }: { page: LegalPageId }) {
  const locale = (await getLocale()) as Locale;
  const published = LEGAL_LANGUAGES[page];
  if ((published as readonly string[]).includes(locale)) {
    return null;
  }

  const t = await getTranslations("legal");
  const names = published.map((code) => t(LANG_KEY[code]));
  const languages = names.join(", ");

  return (
    <aside className="vt-legal-notice" data-notice="present">
      <Icon name="info" size={20} color="var(--vt-text-muted)" />
      <div className="vt-legal-notice__copy">
        <p className="vt-legal-notice__heading">{t("language-coverage-heading")}</p>
        <p className="vt-legal-notice__body">{t("language-coverage-body", { languages })}</p>
        <p className="vt-legal-notice__links">
          <span>{t("language-coverage-switch")}</span>
          {published.map((code) => (
            <Link key={code} href={PAGE_HREF[page]} locale={code}>
              {t(LANG_KEY[code])}
            </Link>
          ))}
        </p>
      </div>
    </aside>
  );
}
