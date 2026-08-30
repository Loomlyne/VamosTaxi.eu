import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { PageHero, Prose, ProseSection } from "@/components/marketing";
import { PendingSlot } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";
import "./about.css";

const { Link } = createNavigation(routing);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return {
    title: t("about-vamos-taxi"),
    description: t("a-zurich-operator-not-a-marketplace"),
    alternates: buildAlternates("/about"),
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const tCommon = await getTranslations("common");

  return (
    <main>
      <PageHero
        kickerKey="who-we-are"
        titleKey="about-vamos-taxi"
        standfirstKey="a-zurich-operator-not-a-marketplace"
        crumbCurrentKey="about-vamos-taxi"
        photo="/brand/photography/hero-arrivals.jpg"
        altKey="arrivals-hall-at-zurich-airport"
      />
      <div data-sec="1">
        <Prose>
          <ProseSection id="story-h" labelledBy="story-h-title">
            <h2 id="story-h-title">{t("who-we-are")}</h2>
            <p>{t("vamos-taxi-gmbh-was-registered-in-dietikon-in-th")}</p>
            <p>{t("we-are-a-scheduled-operator-you-cannot-hail-us-o")}</p>
          </ProseSection>
          <ProseSection id="promise-h" labelledBy="promise-h-title">
            <h2 id="promise-h-title">{t("four-things-we-will-hold-to")}</h2>
            <p>{t("the-price-does-not-move")}</p>
            <p>{t("the-car-is-there-first")}</p>
            <p>{t("we-watch-your-flight")}</p>
            <p>{t("a-real-company-behind-it")}</p>
          </ProseSection>
          <ProseSection id="fleet-h" labelledBy="fleet-h-title">
            <h2 id="fleet-h-title">{t("the-fleet")}</h2>
            <p>{t("three-classes-chosen-by-what-you-are-carrying")}</p>
            <figure data-shot="1">
              <Image
                src="/brand/photography/fleet-van-street.jpg"
                alt={t("a-charcoal-mercedes-v-class-van-on-a-city-street")}
                width={1200}
                height={800}
                sizes="100vw"
              />
              <figcaption data-shot-cap="1">{t("the-v-class-our-van-class-the-only-vehicle-photo")}</figcaption>
            </figure>
          </ProseSection>
          <ProseSection id="where-h" labelledBy="where-h-title">
            <h2 id="where-h-title">{t("where-we-drive")}</h2>
            <p>{t("airport-transfers-to-and-from-zurich-are-the-cor")}</p>
            <p>
              {t("we-do-not-claim-to-be-everywhere-if-a-route-is-o")}
            </p>
          </ProseSection>
          <ProseSection id="drivers-h" labelledBy="drivers-h-title">
            <h2 id="drivers-h-title">{t("our-drivers")}</h2>
            <p>{t("every-driver-who-works-with-us-is-licensed-for-p")}</p>
            <p>
              {t("support-runs")} <PendingSlot label="Support languages" />
            </p>
          </ProseSection>
          <ProseSection id="close-h" labelledBy="close-h-title">
            <h2 id="close-h-title">{t("talk-to-us")}</h2>
            <p>
              <Link href="/">{tCommon("book-a-transfer")}</Link>
            </p>
          </ProseSection>
        </Prose>
      </div>
    </main>
  );
}
