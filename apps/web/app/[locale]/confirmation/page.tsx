import { getTranslations, setRequestLocale } from "next-intl/server";
import "./[ref]/confirmation.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("notVisibleTitle"), robots: { index: false, follow: false } };
}

export default async function ConfirmationIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");
  return (
    <main className="vt-confirmation" data-confirmation data-confirmation-state="hidden">
      <div className="vt-confirmation__hero">
        <h1 className="vt-confirmation__title">{t("notVisibleTitle")}</h1>
        <p className="vt-confirmation__lede">{t("notVisibleBody")}</p>
      </div>
    </main>
  );
}
