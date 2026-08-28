import { setRequestLocale, getLocale } from "next-intl/server";
import { LanguageCoverageNotice } from "@/components/legal";
import { LEGAL_LANGUAGES, type LegalPageId } from "@/lib/legal-languages";
import type { Locale } from "@/i18n/routing";

const PAGES: LegalPageId[] = ["terms", "privacy", "cookies", "cancellation", "imprint"];

export default async function LegalNoticeGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const active = (await getLocale()) as Locale;

  return (
    <main>
      {PAGES.map((page) => {
        const langs = LEGAL_LANGUAGES[page];
        const present = !(langs as readonly string[]).includes(active);
        return (
          <section
            key={page}
            data-screen-label={`${page} ${langs.join(" ")}`}
            data-page={page}
            data-notice={present ? "present" : "absent"}
          >
            <p>
              {page} · {langs.join(" ")}
            </p>
            <LanguageCoverageNotice page={page} />
          </section>
        );
      })}
    </main>
  );
}
