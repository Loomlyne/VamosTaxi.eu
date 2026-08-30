import { setRequestLocale } from "next-intl/server";
import { ServiceCard, type ServiceCardPreview, type ServiceCardState } from "@/components/home/ServiceCard";
import { Services } from "@/components/home/Services";

const CARD_STATES: ServiceCardState[] = ["default", "selected", "disabled", "loading"];
const PREVIEWS: ServiceCardPreview[] = ["hover", "press", "focus"];
const TONES = ["light", "inverse"] as const;

export default async function HomeServicesGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main>
      {TONES.map((tone) =>
        CARD_STATES.map((state) => (
          <section
            key={`${tone}-${state}`}
            data-state={`${tone}-${state}`}
            data-tone={tone}
            style={{ padding: 24, maxInlineSize: 460 }}
          >
            <ServiceCard
              href="/#book"
              titleId="airport-transfers"
              icon="plane-landing"
              tone={tone}
              state={state}
              accent={state === "selected"}
            >
              Fixed-price rides to and from the airport, timed to your flight.
            </ServiceCard>
          </section>
        )),
      )}
      {TONES.map((tone) =>
        PREVIEWS.map((preview) => (
          <section
            key={`${tone}-${preview}`}
            data-state={`${tone}-${preview}`}
            data-tone={tone}
            style={{ padding: 24, maxInlineSize: 460 }}
          >
            <ServiceCard
              href="/#book"
              titleId="airport-transfers"
              icon="plane-landing"
              tone={tone}
              preview={preview}
            >
              Fixed-price rides to and from the airport, timed to your flight.
            </ServiceCard>
          </section>
        )),
      )}
      <section data-state="section-hourly-on">
        <Services showChauffeurByHour mediaTone="light" />
      </section>
      <section data-state="section-hourly-off">
        <Services showChauffeurByHour={false} mediaTone="light" />
      </section>
      <section data-state="section-tone-light">
        <Services showChauffeurByHour={false} mediaTone="light" />
      </section>
      <section data-state="section-tone-inverse">
        <Services showChauffeurByHour={false} mediaTone="inverse" />
      </section>
    </main>
  );
}
