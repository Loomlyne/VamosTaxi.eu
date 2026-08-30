import { getLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { CheckerMark } from "@/components/core";
import { FaqGrid, type FaqItem } from "@/components/marketing";
import "./HomeFaq.css";

const { Link } = createNavigation(routing);

export type HomeFaqString = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pendingValue: boolean;
  nonTranslatable: boolean;
};

export type HomeFaqState = "default" | "loading" | "empty" | "error";

export type HomeFaqProps = {
  items: FaqItem[];
  strings: HomeFaqString[];
  state?: HomeFaqState;
};

type LocaleCol = "en" | "de" | "fr" | "ar";

/** Locale column: en fallback; pending and non-translatable rows always return en. */
function localeText(row: HomeFaqString, locale: LocaleCol): string {
  if (row.pendingValue || row.nonTranslatable) return row.en;
  if (locale === "en") return row.en;
  return row[locale] ?? row.en;
}

function byKey(strings: HomeFaqString[], key: string): HomeFaqString | undefined {
  return strings.find((row) => row.key === key);
}

export async function HomeFaq({ items, strings, state = "default" }: HomeFaqProps) {
  const locale = (await getLocale()) as LocaleCol;
  const tFaq = await getTranslations("faq");
  const tCommon = await getTranslations("common");

  const titleRow = byKey(strings, "faq.frequently-asked-questions");
  const title = titleRow ? localeText(titleRow, locale) : tFaq("frequently-asked-questions");

  const resolved: FaqItem[] = items.map((item) => {
    const qRow = byKey(strings, `faq.${item.questionKey}`);
    const answers = item.answerKeys.map((key) => {
      const row = byKey(strings, `faq.${key}`);
      return row ? localeText(row, locale) : "";
    });
    return {
      ...item,
      question: qRow ? localeText(qRow, locale) : undefined,
      answers: answers.some(Boolean) ? answers : undefined,
    };
  });

  const gridState = state === "error" ? "empty" : state;

  return (
    <section
      id="faq"
      data-home-faq="1"
      data-state={state}
      aria-labelledby="faq-title"
      style={{ ["--faq-card-min-block-size" as string]: "190px" }}
    >
      <div className="vt-hf-grain" aria-hidden="true" />
      <div data-home-faq-wrap="1">
        <p className="vt-hf-kicker">
          <CheckerMark size={16} />
          {tCommon("faq")}
        </p>
        <h2 id="faq-title">{title}</h2>
        {state === "error" ? (
          <p data-home-faq-error="1">{tFaq("could-not-load-questions")}</p>
        ) : (
          <FaqGrid items={resolved} mode="single" state={gridState} />
        )}
        <p className="vt-hf-all">
          <Link href="/faq">{tFaq("see-all-questions")}</Link>
        </p>
      </div>
    </section>
  );
}
