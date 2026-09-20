import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AuthSplit } from "../sign-in/AuthSplit";
import { SignInClient } from "../sign-in/SignInClient";

const { redirect } = createNavigation(routing);

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
    robots: { index: false, follow: false },
  };
}

export default async function SignUpPage({
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
  if (user) {
    redirect({ href: "/", locale });
  }

  return (
    <AuthSplit guestNote>
      <SignInClient locale={locale} initialMode="signup" />
    </AuthSplit>
  );
}
