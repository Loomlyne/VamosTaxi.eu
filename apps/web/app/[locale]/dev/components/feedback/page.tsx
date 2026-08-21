import { setRequestLocale } from "next-intl/server";
import { FeedbackGallery } from "./FeedbackGallery";

// Thin Server Component wrapper — same split as Plan 06/07's own dev gallery routes:
// resolves/validates the locale segment (Pitfall 2 — setRequestLocale must run for
// this route to stay statically eligible) and hands off to FeedbackGallery.tsx, a
// client component, for the actual gallery markup (see that file's own comment for
// why the split exists — Dialog's open/close cycle and Tooltip's own hover/focus
// state both need real client-side state and functions, which a Server Component
// cannot pass across the boundary).
export default async function FeedbackComponentsGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <FeedbackGallery />;
}
