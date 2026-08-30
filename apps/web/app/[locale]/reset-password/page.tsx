import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHero } from "@/components/marketing";
import { buildAlternates } from "@/lib/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ResetClient } from "./ResetClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tAuth = await getTranslations({ locale, namespace: "auth" });
  return {
    title: tAuth("save-new-password"),
    description: tAuth("reset-links-work-once-and-only-for-a-short-while"),
    alternates: buildAlternates("/reset-password"),
  };
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  const initialStage = user ? "form" : "expired";

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
      <ResetClient email={email} initialStage={initialStage} />
    </main>
  );
}
