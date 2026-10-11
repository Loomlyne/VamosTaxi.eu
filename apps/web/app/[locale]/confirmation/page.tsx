import { getCloudflareContext } from "@opennextjs/cloudflare";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button, Card, Icon } from "@/components/core";
import { isCheckoutSessionId, referenceForCheckoutSession } from "@/lib/checkout/return-settle";
import { localePath } from "@/lib/checkout/steps";
import "./[ref]/confirmation.css";

export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = "info@vamostaxi.site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("payCheckingTitle"), robots: { index: false, follow: false } };
}

function workerEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env;
  } catch {
    return null;
  }
}

/**
 * `/confirmation?session=<cs>`: Stripe returned and the booking reference could not be
 * resolved yet (Stripe unreadable, or no reference on the session).
 *
 * J5 (W3-15, W3-01): the page never says "Payment received" (nothing here knows the payment
 * is captured) and is never a dead end. It looks the session up in the database only (no
 * Stripe call, no PII): once the reference is known it goes on to `/confirmation/<ref>`,
 * which polls and shows the booking. Until then it says "we are checking your payment",
 * offers "Check again" (this same page) and the support address.
 */
export default async function ConfirmationIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const raw = Array.isArray(query.session) ? query.session[0] : query.session;
  const session = raw && isCheckoutSessionId(raw) ? raw : "";

  const env = session ? workerEnv() : null;
  if (env) {
    const reference = await referenceForCheckoutSession(env, session);
    if (reference) redirect(`${localePath(locale, `/confirmation/${reference}`)}?check=1`);
  }

  const t = await getTranslations("checkout");
  const again = session ? `${localePath(locale, "/confirmation")}?session=${encodeURIComponent(session)}` : null;
  return (
    <main className="vt-confirmation" data-confirmation data-confirmation-state="checking">
      <Card padding="lg" className="vt-confirmation__wait vt-confirmation__loading">
        <div aria-live="polite" className="vt-confirmation__loading-body">
          <span className="vt-confirmation__disc" aria-hidden="true">
            <Icon name="clock" size={28} color="var(--vt-yellow)" />
          </span>
          <h1 className="vt-confirmation__title">{t("payCheckingTitle")}</h1>
          <p className="vt-confirmation__lede">{t("payCheckingStalledBody", { email: SUPPORT_EMAIL })}</p>
        </div>
        <div className="vt-confirmation__actions">
          {again ? (
            <Button href={again} data-confirmation-check-again>
              {t("payCheckingAgain")}
            </Button>
          ) : null}
          <Button variant="secondary" href={localePath(locale, "/")}>
            {t("book-another-transfer")}
          </Button>
        </div>
      </Card>
    </main>
  );
}
