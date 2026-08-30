import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Button, CheckerMark } from "@/components/core";
import { FaqGrid, ProseSection, type FaqItem } from "@/components/marketing";
import { buildAlternates } from "@/lib/metadata";
import "@/components/marketing/PageHero.css";

const { getPathname } = createNavigation(routing);

const BOOKING_ITEMS: FaqItem[] = [
  {
    id: "change-date",
    questionKey: "how-can-i-change-the-date-or-time-of-my-booking",
    answerKeys: [
      "open-your-booking-from-the-link-in-your-confirma",
      "if-the-new-time-changes-the-fare-you-pay-or-we-r",
    ],
  },
  {
    id: "cancel-ride",
    questionKey: "how-do-i-cancel-my-ride",
    answerKeys: [
      "from-the-manage-booking-link-in-your-confirmatio",
      "cannot-reach-either-call-us-and-quote-your-booki",
    ],
  },
];

const PRICING_ITEMS: FaqItem[] = [
  {
    id: "confirmation",
    questionKey: "when-will-i-receive-my-booking-confirmation",
    answerKeys: [
      "immediately-after-payment-by-email-it-carries-yo",
      "your-drivers-name-vehicle-and-telephone-number-a",
      "before-pickup-ask-us-and-we-will-send-them-soone",
    ],
  },
  {
    id: "cancellation-policy",
    questionKey: "what-is-the-cancellation-policy",
    answerKeys: [
      "cancel-early-and-you-get-the-most-back-the-close",
      "we-do-not-restate-the-windows-or-the-shares-here",
    ],
  },
  {
    id: "tip",
    questionKey: "do-i-need-to-tip-the-chauffeur",
    answerKeys: ["no-the-gratuity-is-already-in-the-price-you-were"],
  },
];

const SERVICE_ITEMS: FaqItem[] = [
  {
    id: "chauffeur-contact",
    questionKey: "how-do-i-get-in-touch-with-my-chauffeur",
    answerKeys: [
      "you-get-their-name-and-direct-number-by-sms-and",
      "before-pickup-call-or-message-them-directly-on-t",
      "before-that-or-if-nobody-answers-call-our-number",
    ],
  },
  {
    id: "child-seat",
    questionKey: "can-i-bring-my-own-child-or-booster-seat",
    answerKeys: [
      "yes-and-it-travels-free-we-can-also-provide-one",
      "swiss-law-decides-which-seat-a-child-needs-and-t",
    ],
  },
];

const FAQ_ITEMS: FaqItem[] = [...BOOKING_ITEMS, ...PRICING_ITEMS, ...SERVICE_ITEMS];

const wrapStyle: CSSProperties = {
  maxInlineSize: 1200,
  marginInline: "auto",
  paddingBlock: "36px 8px",
  paddingInline: "clamp(20px, 5vw, 56px)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  marginBlockEnd: 8,
  fontFamily: "var(--vt-font-display)",
  fontSize: "var(--vt-heading-1)",
  fontWeight: "var(--vt-weight-semibold)",
  color: "var(--vt-text-primary)",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tFaq = await getTranslations({ locale, namespace: "faq" });
  return {
    title: tFaq("frequently-asked-questions"),
    description: tFaq("the-things-travellers-ask-us-most-anything-with"),
    alternates: buildAlternates("/faq"),
  };
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tFaq = await getTranslations("faq");
  const tCommon = await getTranslations("common");
  const contactHref = getPathname({ href: "/contact", locale });
  const manageHref = getPathname({ href: "/manage-booking", locale });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: tFaq(item.questionKey),
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answerKeys.map((key) => tFaq(key)).join(" "),
      },
    })),
  };

  return (
    <main>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <header data-mh-hero="1">
        <div className="vt-mh-hero-inner">
          <div className="vt-mh-checker" aria-hidden="true">
            <CheckerMark size={56} opacity={0.9} />
          </div>
          <nav aria-label={tCommon("breadcrumb")} className="vt-mh-crumb">
            <a href={getPathname({ href: "/", locale })}>{tCommon("home")}</a>
            <span aria-hidden="true">/</span>
            <span>{tCommon("faq")}</span>
          </nav>
          <p className="vt-mh-kicker">{tCommon("support")}</p>
          <h1>{tFaq("questions-answered")}</h1>
          <p className="vt-mh-standfirst">{tFaq("the-things-travellers-ask-us-most-anything-with")}</p>
        </div>
      </header>

      <div style={wrapStyle}>
        <ProseSection id="booking" labelledBy="booking-h">
          <h2 id="booking-h" style={headingStyle}>
            {tCommon("booking-reservations")}
          </h2>
          <p>{tFaq("two-questions")}</p>
          <FaqGrid items={BOOKING_ITEMS} />
        </ProseSection>

        <ProseSection id="pricing" labelledBy="pricing-h">
          <h2 id="pricing-h" style={headingStyle}>
            {tCommon("pricing-payment")}
          </h2>
          <p>{tFaq("three-questions")}</p>
          <FaqGrid items={PRICING_ITEMS} />
        </ProseSection>

        <ProseSection id="service" labelledBy="service-h">
          <h2 id="service-h" style={headingStyle}>
            {tCommon("service-safety")}
          </h2>
          <p>{tFaq("two-questions")}</p>
          <p>{tFaq("every-transfer-is-booked-ahead-and-assigned-to-a")}</p>
          <FaqGrid items={SERVICE_ITEMS} />
        </ProseSection>
      </div>

      <section
        style={{
          maxInlineSize: 1200,
          marginInline: "auto",
          paddingBlock: "clamp(40px, 4vw, 56px) 72px",
          paddingInline: "clamp(20px, 5vw, 56px)",
        }}
      >
        <div
          style={{
            background: "var(--vt-bg-surface)",
            border: "1px solid var(--vt-border-subtle)",
            borderRadius: "var(--vt-radius-lg)",
            padding: "clamp(24px, 3vw, 36px)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "24px 40px",
          }}
        >
          <div style={{ flex: "1 1 320px", minInlineSize: 0 }}>
            <h2
              style={{
                margin: 0,
                marginBlockEnd: 8,
                fontFamily: "var(--vt-font-display)",
                fontSize: "var(--vt-heading-2)",
                fontWeight: "var(--vt-weight-semibold)",
                color: "var(--vt-text-primary)",
              }}
            >
              {tFaq("still-not-answered")}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "var(--vt-body-md)",
                lineHeight: "var(--vt-body-leading)",
                color: "var(--vt-text-secondary)",
                maxInlineSize: "52ch",
              }}
            >
              {tFaq("if-your-question-is-about-a-booking-you-have-alr")}
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button size="md" variant="secondary" href={manageHref} iconEnd="arrow-right">
              {tCommon("manage-a-booking")}
            </Button>
            <Button size="md" variant="ghost" href={contactHref}>
              {tCommon("contact-us")}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
