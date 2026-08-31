import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { buildAlternates } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Vamos Taxi",
    alternates: buildAlternates("/"),
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return null;
}
