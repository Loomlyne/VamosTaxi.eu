import { getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Icon } from "@/components/core";
import { SectionHeader } from "@/components/navigation";
import { ServiceCard } from "./ServiceCard";
import "./Services.css";

const { Link } = createNavigation(routing);

export type ServicesProps = {
  showChauffeurByHour?: boolean;
  mediaTone?: "light" | "inverse";
  /** Mock scroll-stage step (svh). Accepted and ignored: SITE-06 is an auto-fit grid. */
  scrollPerStep?: number;
};

export async function Services({
  showChauffeurByHour = false,
  mediaTone = "light",
  scrollPerStep: _scrollPerStep,
}: ServicesProps) {
  const tServices = await getTranslations("services");
  const tCommon = await getTranslations("common");
  const tHome = await getTranslations("home");
  const tone = mediaTone;
  const hourly = showChauffeurByHour;

  return (
    <section
      data-svc-sec="1"
      data-media-tone={mediaTone}
      className={mediaTone === "inverse" ? "vt-svcs vt-svcs--inverse" : "vt-svcs"}
      aria-labelledby="svc-title"
    >
      <div data-svc-inner="1">
        <SectionHeader
          id="svc-head"
          eyebrow={tCommon("services")}
          title={<span id="svc-title">{tServices("core-services")}</span>}
          subtitle={tServices("every-one-is-booked-ahead-priced-up-front-and-as")}
          tone={mediaTone === "inverse" ? "inverse" : "default"}
        />
        <div data-svc-track="1">
          <ServiceCard
            href={"/#book"}
            titleId="airport-transfers"
            icon="plane-landing"
            tone={tone}
            image="/photos/site/svc-airport.jpg"
            imageFocus="58% center"
          >
            {tServices("fixed-price-rides-to-and-from-the-airport-timed")}
          </ServiceCard>
          <ServiceCard
            href={"/#book"}
            titleId="city-to-city"
            icon="navigation"
            tone={tone}
            image="/photos/site/svc-city.jpg"
            imageFocus="84% center"
          >
            {tServices("private-transfers-between-swiss-cities-scheduled")}
          </ServiceCard>
          <ServiceCard
            href="/about"
            titleId="professional-drivers"
            icon="users"
            tone={tone}
            image="/photos/site/why-driver-door.jpg"
            imageFocus="50% 28%"
          >
            {tServices("your-driver-is-assigned-to-your-booking-and-wai")}
          </ServiceCard>
          {hourly ? (
            <ServiceCard
              href={"/#book"}
              titleId="chauffeur-by-the-hour"
              icon="clock"
              tone={tone}
              image="/photos/site/svc-hourly.jpg"
            >
              {tServices("book-a-driver-and-vehicle-for-multiple-stops-acr")}
            </ServiceCard>
          ) : null}
          <Link data-svc-cta="1" href="/#book">
            <span>
              <span data-svc-cta-kicker="1">{tServices("all-services")}</span>
              <span data-svc-cta-title="1">
                {tHome("your-routes-fixed-price-appears-here-the-moment")}
              </span>
            </span>
            <span data-svc-cta-btn="1">
              {tCommon("book-a-transfer")}
              <Icon name="arrow-right" size={18} />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
