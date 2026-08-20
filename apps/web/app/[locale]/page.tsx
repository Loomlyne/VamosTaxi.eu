import Image from "next/image";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/core";

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
    </main>
  );
}
