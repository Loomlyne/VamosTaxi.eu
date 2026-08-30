import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FaqItem } from "@/components/marketing";
import {
  HomeHero,
  BookingCard,
  HowItWorks,
  Services,
  WhyVamos,
  Reviews,
  HomeFaq,
} from "@/components/home";
import type { ReviewsItem, ReviewsState } from "@/components/home";
import type { HomeFaqState, HomeFaqString } from "@/components/home";
import { getPublishedReviews, getContentStrings } from "@/lib/db/content";
import { buildAlternates } from "@/lib/metadata";
import "./home.css";

// D-10/D-11: this page reads `content_strings` and `reviews` through `publicSql`.
// That is the deliberate exception to the rest of Phase 5's static rendering, and
// it is also what satisfies the DB-access fence's ban #5 without an allowlist entry.
export const dynamic = "force-dynamic";

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
  ...HOME_FAQ_ITEMS.flatMap((item) => [
    `faq.${item.questionKey}`,
    ...item.answerKeys.map((key) => `faq.${key}`),
  ]),
  "common.brandName",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HomePage");
  return {
    title: t("title"),
    description: t("body"),
    alternates: buildAlternates("/"),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  let reviews: ReviewsItem[] = [];
  let reviewState: ReviewsState = "default";
  let strings: HomeFaqString[] = [];
  let faqState: HomeFaqState = "default";
  try {
    const { env } = getCloudflareContext();
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
  } catch {
    reviewState = "error";
    faqState = "error";
  }

  return (
    <main data-home="1">
      <HomeHero>
        {/* BookingCardMount slots (board / price / status) stay unfilled until 05-22. */}
        <BookingCard />
      </HomeHero>
      <HowItWorks />
      <Services showChauffeurByHour={false} />
      <WhyVamos />
      <Reviews reviews={reviews} state={reviewState} />
      <HomeFaq items={HOME_FAQ_ITEMS} strings={strings} state={faqState} />
    </main>
  );
}
