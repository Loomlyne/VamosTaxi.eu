import { setRequestLocale } from "next-intl/server";
import { FaqGallery } from "./FaqGallery";

export default async function FaqGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <FaqGallery />;
}
