import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { PageHero } from "@/components/marketing";
import { buildAlternates } from "@/lib/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SignInClient } from "./SignInClient";

const { redirect } = createNavigation(routing);

// getUser() is a per-request session read, so this route cannot be static.
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
    title: tCommon("sign-in"),
    description: tAuth("you-never-need-an-account-to-book-guest-checkout"),
    alternates: buildAlternates("/sign-in"),
  };
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect({ href: "/", locale });
  }

  const query = await searchParams;
  const initialBanner = query.error ? "credentials" : null;

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
      <SignInClient locale={locale} initialBanner={initialBanner} />
    </main>
  );
}
