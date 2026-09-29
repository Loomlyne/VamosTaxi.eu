import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, Card, Icon } from "@/components/core";
import "./[ref]/confirmation.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("receivedTitle"), robots: { index: false, follow: false } };
}

/**
 * `/confirmation?session=<cs>`: Stripe returned before the reference could be
 * resolved. Static "Payment received." copy only (D-27, T-26.3-14-02): the
 * session id is never looked up in the browser and no error copy is shown.
 */
export default async function ConfirmationIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");
  return (
    <main className="vt-confirmation" data-confirmation data-confirmation-state="received">
      <Card padding="lg" className="vt-confirmation__wait vt-confirmation__loading">
        <div aria-live="polite" className="vt-confirmation__loading-body">
          <span className="vt-confirmation__disc" aria-hidden="true">
            <Icon name="check" size={28} color="var(--vt-yellow)" />
          </span>
          <h1 className="vt-confirmation__title">{t("receivedTitle")}</h1>
          <p className="vt-confirmation__lede">{t("receivedBody")}</p>
        </div>
        <div className="vt-confirmation__actions">
          <Button variant="secondary" href={`/${locale}`}>
            {t("book-another-transfer")}
          </Button>
        </div>
        <p className="vt-confirmation__wait-ref">{t("receivedContact", { email: "info@vamostaxi.site" })}</p>
      </Card>
    </main>
  );
}
