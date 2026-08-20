import { setRequestLocale, getTranslations } from "next-intl/server";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Pitfall 2: also required here so this page keeps its own static
  // rendering eligibility independently of the layout.
  setRequestLocale(locale);

  const t = await getTranslations("HomePage");

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("body")}</p>
    </main>
  );
}
