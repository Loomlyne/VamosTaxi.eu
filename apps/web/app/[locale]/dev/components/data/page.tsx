import { setRequestLocale } from "next-intl/server";
import { DataGallery } from "./DataGallery";

// Thin Server Component wrapper — same split as Plan 06's dev/components/core/page.tsx
// and Plan 09's dev/components/forms/page.tsx: resolves/validates the locale segment
// (Pitfall 2 — setRequestLocale must run for this route to stay statically eligible)
// and hands off to DataGallery.tsx, a client component, for the actual gallery markup
// (see that file's own comment for why the split exists).
export default async function DataComponentsGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DataGallery />;
}
