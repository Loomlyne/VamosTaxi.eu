import { setRequestLocale } from "next-intl/server";
import { HowItWorks } from "@/components/home/HowItWorks";

export default async function HowItWorksGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main>
      <section data-state="light-reveal">
        <HowItWorks tone="light" revealOnScroll />
      </section>
      <section data-state="light-static">
        <HowItWorks tone="light" revealOnScroll={false} />
      </section>
      <section data-state="inverse-reveal">
        <HowItWorks tone="inverse" revealOnScroll />
      </section>
      <section data-state="inverse-static">
        <HowItWorks tone="inverse" revealOnScroll={false} />
      </section>
    </main>
  );
}
