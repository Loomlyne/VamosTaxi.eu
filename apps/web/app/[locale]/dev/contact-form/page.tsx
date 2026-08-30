import { setRequestLocale } from "next-intl/server";
import { ContactForm, type ContactFormPreviewState } from "@/components/forms/ContactForm";
import type { Locale } from "@/i18n/routing";

/** Cloudflare documented always-pass visible site key — no account required. */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

const STATES: ContactFormPreviewState[] = [
  "idle",
  "invalid",
  "submitting",
  "success",
  "challenge-failed",
  "service-unavailable",
];

export default async function ContactFormGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = localeParam as Locale;

  return (
    <main data-contact-gallery="1" dir="ltr" style={{ padding: 24, display: "grid", gap: 32 }}>
      {STATES.map((state) => (
        <section key={state} data-state={state}>
          <h2 dir="ltr">{state}</h2>
          <ContactForm siteKey={TURNSTILE_TEST_SITE_KEY} locale={locale} previewState={state} />
        </section>
      ))}
    </main>
  );
}
