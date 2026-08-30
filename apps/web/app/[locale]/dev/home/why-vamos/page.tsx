import { setRequestLocale } from "next-intl/server";
import { WhyVamos } from "@/components/home/WhyVamos";

export default async function WhyVamosGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main>
      <section data-state="support-on-driven">
        <WhyVamos showSupportText scrollDriven scrollPerStep={52} />
      </section>
      <section data-state="support-off-driven">
        <WhyVamos showSupportText={false} scrollDriven scrollPerStep={52} />
      </section>
      <section data-state="support-on-static">
        <WhyVamos showSupportText scrollDriven={false} scrollPerStep={52} />
      </section>
      <section data-state="per-step-34">
        <WhyVamos showSupportText scrollDriven scrollPerStep={34} />
      </section>
      <section data-state="per-step-90">
        <WhyVamos showSupportText scrollDriven scrollPerStep={90} />
      </section>
    </main>
  );
}
