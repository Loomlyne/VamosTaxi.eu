import { setRequestLocale } from "next-intl/server";
import { AuthGallery } from "./AuthGallery";

export default async function AuthGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main>
      <AuthGallery />
    </main>
  );
}
