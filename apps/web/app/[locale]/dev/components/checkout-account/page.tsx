import { setRequestLocale } from "next-intl/server";
import { CheckoutAccountGallery } from "./CheckoutAccountGallery";

// Thin Server Component wrapper, same split as dev/components/forms/page.tsx: the
// gallery itself is a client component (state, mocked fetch). Dev-only route.
export default async function CheckoutAccountGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CheckoutAccountGallery />;
}
