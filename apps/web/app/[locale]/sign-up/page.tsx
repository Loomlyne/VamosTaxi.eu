import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHero } from "@/components/marketing";
import { buildAlternates } from "@/lib/metadata";
import { SignInClient } from "../sign-in/SignInClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: "common" });
  const tAuth = await getTranslations({ locale, namespace: "auth" });
  return {
    title: tCommon("create-an-account"),
    description: tAuth("you-never-need-an-account-to-book-guest-checkout"),
    alternates: buildAlternates("/sign-up"),
  };
}

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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
      <SignInClient locale={locale} initialMode="signup" />
    </main>
  );
}
