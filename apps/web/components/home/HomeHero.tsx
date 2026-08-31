import type { ReactNode } from "react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/shell";
import "./HomeHero.css";

export async function HomeHero({ children }: { children?: ReactNode }) {
  const t = await getTranslations("home");

  return (
    <section data-hero="1">
      {/* Photograph is decorative: the headline states the same thing in text. */}
      <div className="vt-hh-photo" aria-hidden="true">
        <Image
          src="/brand/photography/hero-arrivals.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
        />
      </div>
      <div className="vt-hh-checker-wrap" aria-hidden="true">
        <div className="vt-hh-checker" />
      </div>
      <div className="vt-hh-scrim" aria-hidden="true" />
      <SiteHeader variant="overlay" cta={false} />
      <div data-hero-inner="1">
        <div className="vt-hh-copy">
          <p className="vt-hh-kicker">{t("pre-booked-transfers-zurich")}</p>
          <h1>{t("land-in-zurich-your-driver-is-waiting")}</h1>
          <p className="vt-hh-standfirst">{t("reliable-fixed-price-airport-and-corporate-rides")}</p>
        </div>
        <div className="vt-hh-card-slot">{children}</div>
      </div>
    </section>
  );
}
