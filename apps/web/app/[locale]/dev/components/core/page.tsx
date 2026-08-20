import { setRequestLocale } from "next-intl/server";
import { CoreGallery } from "./CoreGallery";

// Thin Server Component wrapper: resolves/validates the locale segment (Pitfall 2
// — setRequestLocale must run for this route to stay statically eligible) and
// hands off to CoreGallery.tsx, a client component, for the actual gallery markup
// (see that file's comment for why the split exists).
export default async function CoreComponentsGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CoreGallery />;
}
