import { setRequestLocale } from "next-intl/server";
import { NavigationGallery } from "./NavigationGallery";

// Thin Server Component wrapper — same split as Plan 06/07's own dev gallery routes
// (dev/components/core/page.tsx, dev/components/forms/page.tsx): resolves/validates
// the locale segment (Pitfall 2 — setRequestLocale must run for this route to stay
// statically eligible) and hands off to NavigationGallery.tsx, a client component,
// for the actual gallery markup (see that file's own comment for why the split
// exists — Tabs' per-tab onClick and SectionHeader's onAction both need a real
// client-side function, which a Server Component cannot pass across the boundary).
export default async function NavigationComponentsGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <NavigationGallery />;
}
