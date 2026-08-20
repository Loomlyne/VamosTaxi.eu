import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

// The dev-only states gallery index (D-28). One entry per category
// `design-system/readme.md` §4/§6 already uses — matching
// `apps/web/components/{core,forms,navigation,feedback,transfer,data}/`. Links to
// all six from the start; the five not yet ported 404 until their batch lands
// (Plans 07-09), and Plan 14 asserts all six eventually resolve.
//
// English only, on purpose (CLAUDE.md § "The only copy that stays English on
// purpose is internal... review scaffolds"). This route is not a product surface
// and carries no keys in apps/web/i18n/messages/*.json.
const CATEGORIES = [
  { slug: "core", label: "Core", count: 9 },
  { slug: "forms", label: "Forms", count: 8 },
  { slug: "navigation", label: "Navigation", count: 3 },
  { slug: "feedback", label: "Feedback", count: 5 },
  { slug: "transfer", label: "Transfer", count: 4 },
  { slug: "data", label: "Data", count: 4 },
] as const;

function localeHref(locale: string, path: string): string {
  // next-intl's own `localePrefix: "as-needed"` contract (D-11/D-12): the default
  // locale is unprefixed, every other locale is prefixed. Kept local to this
  // dev-only route rather than reaching into apps/web/i18n/** (Plan 07's declared
  // scope in this same wave) for a `createNavigation` helper.
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

export default async function DevComponentsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)", maxWidth: 640 }}>
      {/* dir="ltr" on the scaffold's own English prose only — see
          CoreGallery.tsx's comment on the same fix, found during the Arabic
          manual pass. */}
      <h1 dir="ltr">Component gallery</h1>
      <p dir="ltr">
        Internal review scaffold, English only on purpose. Every ported component,
        grouped by the same six categories the design system uses. A category not
        yet ported returns a 404 until its port batch lands.
      </p>
      <ul style={{ paddingInlineStart: "20px" }}>
        {CATEGORIES.map((cat) => (
          <li key={cat.slug} dir="ltr">
            <a href={localeHref(locale, `/dev/components/${cat.slug}`)}>
              {cat.label} ({cat.count})
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
