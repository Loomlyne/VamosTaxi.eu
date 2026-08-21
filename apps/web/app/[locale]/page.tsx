import Image from "next/image";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/core";
import { BookingDraftFields } from "@/components/booking";
import { buildAlternates } from "@/lib/metadata";

// D-19: the home page's own `alternates` come from the one shared helper — no
// hand-maintained hreflang block here. I18N-03's own automated check (01-VALIDATION.md)
// asserts these land in the raw server-rendered response, not just in a client-side
// <head> mutation, so this runs through Next's `generateMetadata` (server-only) rather
// than a client effect.
export async function generateMetadata(): Promise<Metadata> {
  return { alternates: buildAlternates("/") };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Pitfall 2: also required here so this page keeps its own static
  // rendering eligibility independently of the layout.
  setRequestLocale(locale);

  const t = await getTranslations("HomePage");

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("body")}</p>
      <Button variant="primary" size="lg">
        {t("cta")}
      </Button>
      {/* Plan 05, Task 3: proves next/image's real behaviour on this
          platform (RESEARCH Pitfall 5) against the one repo-tracked
          photograph, at two sizes, before Phase 5 depends on it for real
          photography. No scrim/typography here — that is Phase 5's job;
          this is the delivery mechanism only. */}
      <Image
        src="/brand/photography/hero-arrivals.jpg"
        alt=""
        width={640}
        height={455}
        data-image-proof="640"
      />
      <Image
        src="/brand/photography/hero-arrivals.jpg"
        alt=""
        width={320}
        height={228}
        data-image-proof="320"
      />
      {/* Plan 12, Task 2: the ADR-001 acceptance-test surface — a half-filled draft
          here must survive a language switch (tests/integration/lang-switch.spec.ts).
          Phase 4/5 replace this minimal field set with the real booking widget on top
          of the same apps/web/lib/booking-draft.ts store. */}
      <BookingDraftFields />
    </main>
  );
}
