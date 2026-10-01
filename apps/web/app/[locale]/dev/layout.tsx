import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { devGalleryEnabled } from "@/lib/dev-gallery";

// D-02 (26.0, 2026-09-29): the dev-only states gallery (`/dev/**`) opens only in a local
// `next dev` started with VAMOS_DEV_GALLERY=1 (see lib/dev-gallery.ts). Every production
// build answers 404, staging included: DEPLOY_ENV no longer reopens it.
//
// `dynamic = "force-dynamic"` keeps the check per request rather than baked at build time.
export const dynamic = "force-dynamic";

export default function DevLayout({ children }: { children: ReactNode }) {
  if (!devGalleryEnabled()) {
    notFound();
  }
  return <>{children}</>;
}

// The robots header itself is NOT set here — a layout has no supported way to write a
// response header (`headers()` from `next/headers` is read-only). It is set
// unconditionally, in every environment, by `next.config.ts`'s own `headers()` rule for
// `/dev/:path*` and `/:locale/dev/:path*` — see that file's comment for why the two
// source patterns are both needed (D-11/D-12's unprefixed-English / prefixed-other-
// locales URL contract). A 404 response from this layout still carries that header
// (headers() attaches regardless of the eventual status code), which is fine — nothing
// about a 404 needs to be indexable either.
//
// STALE PLAN PATH NOTE: the plan's own artifact list names this file
// `apps/web/app/dev/layout.tsx`. That path predates the locale-scoped dev route tree
// (`apps/web/app/[locale]/dev/components/**`, established Plan 06 onward) — an
// unprefixed `apps/web/app/dev/layout.tsx` would sit OUTSIDE `[locale]` entirely and
// never wrap the real routes at all. Reconciled to the real path per this plan's own
// `<path_correction>` instruction; recorded as a deviation in the plan Summary.
