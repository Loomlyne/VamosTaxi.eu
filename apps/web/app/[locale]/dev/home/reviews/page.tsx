import { getLocale, setRequestLocale } from "next-intl/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type FaqItem } from "@/components/marketing";
import { HomeFaq } from "@/components/home/HomeFaq";
import { Reviews, type ReviewsItem } from "@/components/home/Reviews";
import { getContentStrings, getPublishedReviews, pickLocaleColumn, type ContentStringRow } from "@/lib/db/content";

const FIXTURE_REVIEWS: ReviewsItem[] = [
  {
    id: "fix-1",
    authorName: "Ada L.",
    authorRole: "Airport transfer, Zurich",
    body: "The driver was waiting with a name board.",
    rating: 5,
    routeLabel: "ZRH → Zurich city",
    avatarPath: null,
    sourceUrl: "https://maps.google.com/example",
    verified: true,
  },
  {
    id: "fix-2",
    authorName: "Ben O.",
    authorRole: "Ski transfer, Zermatt",
    body: "On time at the station, bags in the back, no meter.",
    rating: 4,
    routeLabel: "ZRH → Zermatt",
    avatarPath: null,
    sourceUrl: null,
    verified: false,
  },
  {
    id: "fix-3",
    authorName: "Chloé M.",
    authorRole: "Corporate account",
    body: "Invoiced, on the minute, and the car was clean.",
    rating: 5,
    routeLabel: "Zurich → Basel",
    avatarPath: null,
    sourceUrl: null,
    verified: true,
  },
];

const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    id: "price",
    questionKey: "is-the-price-i-see-the-final-price",
    answerKeys: ["yes-your-fare-is-calculated-from-the-route-and-t"],
  },
  {
    id: "account",
    questionKey: "do-i-need-an-account-to-book",
    answerKeys: ["no-guest-checkout-takes-an-email-address-and-a-m"],
  },
  {
    id: "pay",
    questionKey: "what-payment-methods-do-you-accept",
    answerKeys: ["card-payment-processed-by-stripe-every-method-av"],
  },
  {
    id: "notice",
    questionKey: "how-far-in-advance-do-i-need-to-book",
    answerKeys: ["placeholder-the-minimum-notice-before-a-pickup-h"],
  },
  {
    id: "cancel",
    questionKey: "can-i-cancel-or-change-my-booking",
    answerKeys: ["placeholder-the-cancellation-and-change-policy-i"],
  },
];

const HOME_FAQ_STRING_KEYS = [
  "faq.frequently-asked-questions",
  ...HOME_FAQ_ITEMS.flatMap((item) => [`faq.${item.questionKey}`, ...item.answerKeys.map((k) => `faq.${k}`)]),
  "common.brandName",
] as const;

const FIXTURE_STRINGS: ContentStringRow[] = [
  {
    key: "faq.frequently-asked-questions",
    en: "Frequently asked questions",
    de: "Häufig gestellte Fragen",
    fr: "Questions fréquentes",
    ar: "الأسئلة الشائعة",
    pendingValue: false,
    nonTranslatable: false,
  },
  {
    key: "faq.is-the-price-i-see-the-final-price",
    en: "Is the price I see the final price?",
    de: "Ist der Preis, den ich sehe, der Endpreis?",
    fr: "Le prix affiché est-il le prix définitif ?",
    ar: "هل السعر الذي أراه هو السعر النهائي؟",
    pendingValue: false,
    nonTranslatable: false,
  },
  {
    key: "faq.yes-your-fare-is-calculated-from-the-route-and-t",
    en: "Yes. Your fare is calculated from the route and the vehicle class before you book.",
    de: "Ja. Ihr Preis wird vor der Buchung aus Route und Klasse berechnet.",
    fr: "Oui. Votre tarif est calculé avant la réservation.",
    ar: "نعم. يُحتسب سعرك قبل الحجز.",
    pendingValue: false,
    nonTranslatable: false,
  },
  {
    key: "faq.do-i-need-an-account-to-book",
    en: "Do I need an account to book?",
    de: "Brauche ich ein Konto zum Buchen?",
    fr: "Faut-il un compte pour réserver ?",
    ar: "هل أحتاج حساباً للحجز؟",
    pendingValue: false,
    nonTranslatable: false,
  },
  {
    key: "faq.no-guest-checkout-takes-an-email-address-and-a-m",
    en: "No. Guest checkout takes an email address and a mobile number.",
    de: "Nein. Der Gast-Checkout braucht E-Mail und Mobilnummer.",
    fr: "Non. Le paiement invité prend un e-mail et un mobile.",
    ar: "لا. يكفي بريد ورقم جوّال.",
    pendingValue: false,
    nonTranslatable: false,
  },
  {
    key: "common.brandName",
    en: "Vamos Taxi",
    de: "Vamos Taxi",
    fr: "Vamos Taxi",
    ar: "Vamos Taxi",
    pendingValue: false,
    nonTranslatable: true,
  },
];

async function LiveProof() {
  const { env } = getCloudflareContext();
  const locale = (await getLocale()) as "en" | "de" | "fr" | "ar";
  let reviews: ReviewsItem[] = [];
  let strings: ContentStringRow[] = [];
  let reviewState: "default" | "empty" | "error" = "default";
  let faqState: "default" | "empty" | "error" = "default";
  try {
    reviews = await getPublishedReviews(env, 10);
    reviewState = reviews.length === 0 ? "empty" : "default";
  } catch {
    reviewState = "error";
  }
  try {
    strings = await getContentStrings(env, HOME_FAQ_STRING_KEYS);
    faqState = strings.length === 0 ? "empty" : "default";
  } catch {
    faqState = "error";
  }
  const missing = await (async () => {
    try {
      return (await getContentStrings(env, ["faq.does-not-exist-05-18"])).length;
    } catch {
      return -1;
    }
  })();
  const brand = strings.find((row) => row.key === "common.brandName");

  return (
    <main data-live="1">
      <p data-chrome="1" data-vt-no-i18n>
        Home chrome
      </p>
      <p data-brand="1">{brand ? pickLocaleColumn(brand, locale) : ""}</p>
      <p data-string-count={String(strings.length)} data-missing-count={String(missing)} hidden>
        {strings.map((row) => row.key).join(",")}
      </p>
      <Reviews reviews={reviews} state={reviewState} autoplaySeconds={0} />
      <HomeFaq items={HOME_FAQ_ITEMS} strings={strings} state={faqState} />
    </main>
  );
}

export default async function HomeReviewsGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ live?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  if (query.live === "1") return <LiveProof />;

  return (
    <main>
      <section data-tile="default">
        <Reviews reviews={FIXTURE_REVIEWS} state="default" autoplaySeconds={0} slideMs={480} />
      </section>
      <section data-tile="loading">
        <Reviews reviews={[]} state="loading" />
      </section>
      <section data-tile="empty">
        <Reviews reviews={[]} state="empty" />
      </section>
      <section data-tile="error">
        <Reviews reviews={[]} state="error" />
      </section>
      <section data-tile="pending">
        <Reviews reviews={FIXTURE_REVIEWS} state="default" showPendingNotice autoplaySeconds={0} />
      </section>
      <section data-tile="autoplay-off">
        <Reviews reviews={FIXTURE_REVIEWS} state="default" autoplaySeconds={0} />
      </section>
      <section data-tile="autoplay-on">
        <Reviews reviews={FIXTURE_REVIEWS} state="default" autoplaySeconds={2.5} slideMs={200} />
      </section>
      <section data-tile="faq-default">
        <HomeFaq items={HOME_FAQ_ITEMS} strings={FIXTURE_STRINGS} state="default" />
      </section>
      <section data-tile="faq-loading">
        <HomeFaq items={HOME_FAQ_ITEMS} strings={FIXTURE_STRINGS} state="loading" />
      </section>
      <section data-tile="faq-empty">
        <HomeFaq items={[]} strings={[]} state="empty" />
      </section>
      <section data-tile="faq-error">
        <HomeFaq items={HOME_FAQ_ITEMS} strings={[]} state="error" />
      </section>
    </main>
  );
}
