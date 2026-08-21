import { setRequestLocale } from "next-intl/server";
import { ShellGallery } from "./ShellGallery";

// Thin Server Component wrapper — the same split every other dev gallery route in this
// phase uses: resolve/validate the locale segment (Pitfall 2 — `setRequestLocale` must
// run for this route to stay statically eligible) and hand off to `ShellGallery.tsx`,
// a client component, for the markup.
//
// This route lives under `app/[locale]/` rather than at the literal
// `app/dev/components/shell` path 01-13-PLAN.md names, for the reason 01-06-SUMMARY.md
// already recorded for its own gallery: `[locale]` is the only route tree this app has,
// and a page outside it could never match `/ar/dev/components/shell` — which the plan's
// own Task 3 verify block curls and asserts `dir="rtl"` against.
//
// The shell is deliberately NOT rendered around this page by the layout (see
// `apps/web/components/shell/SiteShell.tsx`), which is exactly what makes it usable as
// a gallery: the header and footer tiles below are the only ones on the page, so a
// reviewer is looking at the component, not at the page's own chrome.
export default async function ShellComponentsGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ShellGallery />;
}
