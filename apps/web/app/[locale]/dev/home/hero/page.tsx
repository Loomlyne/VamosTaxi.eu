import { setRequestLocale } from "next-intl/server";
import { HomeHero } from "@/components/home/HomeHero";
import { BookingCard } from "@/components/home/BookingCard";

const EMPTY = {
  pickup: "",
  destination: "",
  date: "",
  time: "",
  passengers: 1,
  luggage: 0,
  flightNumber: "",
};

const FILLED = {
  pickup: "Zurich Airport",
  destination: "Bahnhofstrasse 1, Zürich",
  date: "2026-09-12",
  time: "08:15",
  passengers: 2,
  luggage: 2,
  flightNumber: "LX1234",
};

export default async function HomeHeroGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main>
      <section data-state="empty">
        <HomeHero>
          <BookingCard lockedDraft={EMPTY} />
        </HomeHero>
      </section>
      <section data-state="filled">
        <HomeHero>
          <BookingCard lockedDraft={FILLED} />
        </HomeHero>
      </section>
      <section data-state="sheet-closed">
        <HomeHero>
          <BookingCard lockedDraft={FILLED} defaultOpen={false} />
        </HomeHero>
      </section>
      <section data-state="sheet-open">
        <HomeHero>
          <BookingCard lockedDraft={FILLED} defaultOpen />
        </HomeHero>
      </section>
      <section data-state="mount">
        <HomeHero>
          <BookingCard
            lockedDraft={FILLED}
            board={<p data-i18n-skip>BOARD SLOT</p>}
            price={<p data-i18n-skip>PRICE SLOT</p>}
            status={<p data-i18n-skip>STATUS SLOT</p>}
          />
        </HomeHero>
      </section>
    </main>
  );
}
