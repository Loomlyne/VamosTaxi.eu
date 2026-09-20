import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { buildAlternates } from "@/lib/metadata";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AuthSplit } from "../sign-in/AuthSplit";
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
    robots: { index: false, follow: false },
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

  const verified = Boolean(user);
  const email = user?.email ?? "";

  return (
    <AuthSplit>
      <ResetClient email={email} initialStage={verified ? "form" : "expired"} />
    </AuthSplit>
  );
}
