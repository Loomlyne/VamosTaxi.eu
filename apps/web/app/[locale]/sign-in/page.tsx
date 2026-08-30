import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { buildAlternates } from "@/lib/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AuthSplit } from "./AuthSplit";
import { SignInClient } from "./SignInClient";

const { redirect } = createNavigation(routing);

// getUser() on this route is a per-request session read, so the page cannot
// be statically generated. A signed-in visitor is redirected home.
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
    <AuthSplit guestNote>
      <SignInClient locale={locale} initialBanner={initialBanner} />
    </AuthSplit>
  );
}
