import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { routing, type Locale } from "@/i18n/routing";
import { Button, CheckerMark, Icon } from "@/components/core";
import { ContactForm } from "@/components/forms/ContactForm";
import { buildAlternates } from "@/lib/metadata";
import {
  PHONE_DISPLAY,
  PHONE_HREF,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
  WHATSAPP_HREF,
} from "@/lib/contact-channels";
import "@/components/marketing/PageHero.css";
import "./contact.css";

const { getPathname, Link } = createNavigation(routing);

// TURNSTILE_SITE_KEY is read from the Worker env per request and passed to the
// client widget as a prop. This route cannot be statically generated.
export const dynamic = "force-dynamic";

function turnstileSiteKey(): string | undefined {
  try {
    const { env } = getCloudflareContext();
    return env.TURNSTILE_SITE_KEY ?? process.env.TURNSTILE_SITE_KEY;
  } catch {
    return process.env.TURNSTILE_SITE_KEY;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tContact = await getTranslations({ locale, namespace: "contact" });
  return {
    title: tContact("talk-to-a-person"),
    description: tContact("one-team-handles-bookings-changes-complaints-and"),
    alternates: buildAlternates("/contact"),
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = localeParam as Locale;
  const tContact = await getTranslations("contact");
  const tCommon = await getTranslations("common");
  const siteKey = turnstileSiteKey();
  const manageHref = getPathname({ href: "/manage-booking", locale });
  const faqHref = getPathname({ href: "/faq", locale });

  return (
    <main data-page="contact">
      <header data-mh-hero="1">
        <div className="vt-mh-hero-inner">
          <div className="vt-mh-checker" aria-hidden="true">
            <CheckerMark size={56} opacity={0.9} />
          </div>
          <nav aria-label={tCommon("breadcrumb")} className="vt-mh-crumb">
            <Link href="/">{tCommon("home")}</Link>
            <span aria-hidden="true">/</span>
            <span>{tCommon("contact")}</span>
          </nav>
          <p className="vt-mh-kicker">{tCommon("support")}</p>
          <h1>{tContact("talk-to-a-person")}</h1>
          <p className="vt-mh-standfirst">{tContact("one-team-handles-bookings-changes-complaints-and")}</p>
        </div>
      </header>

      <div className="vt-contact-wrap">
        <div className="vt-contact-banner">
          <div className="vt-contact-banner__icon">
            <Icon name="ticket" size={22} color="var(--vt-charcoal-900)" />
          </div>
          <div className="vt-contact-banner__copy">
            <h2>{tContact("already-have-a-booking")}</h2>
            <p>{tContact("changes-cancellations-and-driver-details-are-all")}</p>
          </div>
          <div className="vt-contact-banner__actions">
            <Button size="md" href={manageHref} iconEnd="arrow-right">
              {tCommon("manage-a-booking")}
            </Button>
            <Button size="md" variant="light" href={faqHref}>
              {tContact("read-the-faq")}
            </Button>
          </div>
        </div>

        <div className="vt-contact-grid">
          <section className="vt-contact-col" aria-labelledby="form-h" data-contact-form-col="1">
            <h2 id="form-h">{tContact("send-us-a-message")}</h2>
            <p className="vt-contact-col__lead">
              {tContact("reply-within-12-24-hours")} {tContact("for-anything-happening-in-the-next-few-hours-cal")}
            </p>
            <ContactForm siteKey={siteKey} locale={locale} />
          </section>

          <aside className="vt-contact-col vt-contact-aside" aria-labelledby="direct-h">
            <h2 id="direct-h">{tContact("reach-us-directly")}</h2>
            <p className="vt-contact-col__lead">{tContact("support-availability")}</p>

            <div className="vt-contact-channels">
              <a
                className="vt-contact-ch"
                data-ch="phone"
                href={PHONE_HREF}
                aria-label={tContact("telephone")}
              >
                <span className="vt-contact-ch__icon">
                  <Icon name="phone" size={20} color="var(--vt-charcoal-900)" />
                </span>
                <span>
                  <span className="vt-contact-ch__kicker">{tContact("telephone")}</span>
                  <span className="vt-contact-ch__value">
                    <span className="vt-dir-keep">{PHONE_DISPLAY}</span>
                  </span>
                  <span className="vt-contact-ch__sub">{tContact("fastest-for-anything-travelling-today")}</span>
                </span>
              </a>
              <a
                className="vt-contact-ch"
                data-ch="whatsapp"
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={tContact("same-number-good-for-a-photo-of-an-address")}
              >
                <span className="vt-contact-ch__icon">
                  <Icon name="message-circle" size={20} color="var(--vt-charcoal-900)" />
                </span>
                <span>
                  <span className="vt-contact-ch__kicker">WhatsApp</span>
                  <span className="vt-contact-ch__value">
                    <span className="vt-dir-keep">{PHONE_DISPLAY}</span>
                  </span>
                  <span className="vt-contact-ch__sub">
                    {tContact("same-number-good-for-a-photo-of-an-address")}
                  </span>
                </span>
              </a>
              <a
                className="vt-contact-ch"
                data-ch="email"
                href={SUPPORT_EMAIL_HREF}
                aria-label={tCommon("email")}
              >
                <span className="vt-contact-ch__icon">
                  <Icon name="mail" size={20} color="var(--vt-charcoal-900)" />
                </span>
                <span>
                  <span className="vt-contact-ch__kicker">{tCommon("email")}</span>
                  <span className="vt-contact-ch__value">
                    <span className="vt-dir-keep">{SUPPORT_EMAIL}</span>
                  </span>
                  <span className="vt-contact-ch__sub">{tContact("everything-that-is-not-urgent")}</span>
                </span>
              </a>
            </div>

            <div className="vt-contact-chat">
              <p className="vt-contact-chat__kicker">
                <Icon name="message-circle" size={16} color="var(--vt-text-muted)" />
                WhatsApp
              </p>
              <p>{tContact("whatsapp-available-24-7")}</p>
              <Button
                size="md"
                variant="secondary"
                block
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noreferrer noopener"
              >
                {tContact("open-whatsapp")}
              </Button>
            </div>
          </aside>
        </div>
      </div>
      <div className="vt-contact-foot" />
    </main>
  );
}
