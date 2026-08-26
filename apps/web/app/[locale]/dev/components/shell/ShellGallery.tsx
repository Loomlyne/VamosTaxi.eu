"use client";

import type { CSSProperties, ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/shell";

// The shell-category states gallery (D-28). Renders both `SiteHeader` variants, the two
// prop-driven header states (`cta={false}`, `hideAccount`), and `SiteFooter` — with its
// wordmark band and payment marks on, the way every page gets it.
//
// There is no skeleton tile and none should be invented: 01-UI-SPEC.md § E2 records
// that the header has no asynchronous content in this phase — language comes from the
// route segment and currency from client state — so it has no loading state to build.
// It has no error state of its own either; it renders identically on the 404 and error
// pages (D-20).
//
// Two states are genuinely unreachable from a static tile and are documented rather
// than faked: the overlay bar's floating pane (it needs a real scroll past 120px — the
// tile below is scrollable, so it can be reached by scrolling inside it) and the narrow
// row's open menu (a real click). Both are reachable by USING the component on this
// page; neither is forced with a class.
//
// English only, on purpose (CLAUDE.md's review-scaffold exemption) — this route carries
// no keys in apps/web/i18n/messages/*.json. The components inside it, however, are the
// real ones on the real locale runtime, so /de and /ar relabel and mirror them exactly
// as a customer page would.
//
// Client component: SiteHeader and SiteFooter both carry real client state (the scroll
// listener, the narrow menu, the switchers) and this gallery passes real handlers into
// the controlled header tile — neither of which a Server Component can hand across the
// boundary.

const sectionStyle: CSSProperties = {
  paddingBlock: "24px",
  borderBlockEnd: "1px solid var(--vt-border-subtle)",
};

const captionStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--vt-text-muted)",
  marginBlockEnd: "8px",
};

/** Each header tile gets its own containing block: `position:sticky`/`fixed` inside a
 *  `transform`ed ancestor resolves against that ancestor, so four bars on one page stay
 *  in their own tiles instead of stacking at the top of the document. */
const tileStyle: CSSProperties = {
  position: "relative",
  overflow: "auto",
  maxBlockSize: "260px",
  transform: "translateZ(0)",
  border: "1px solid var(--vt-border-subtle)",
  borderRadius: "8px",
};

function Tile({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <p style={captionStyle} dir="ltr">
        {caption}
      </p>
      <div style={tileStyle}>{children}</div>
    </section>
  );
}

/** Filler so the overlay tile has something to scroll past — scrolling this tile is how
 *  a reviewer reaches the floating pane without leaving the gallery. */
function Filler({ ground }: { ground?: boolean }) {
  return (
    <div
      style={{
        blockSize: "600px",
        background: ground
          ? "center / cover no-repeat url('/brand/photography/hero-arrivals.jpg')"
          : "var(--vt-grey-50)",
      }}
    />
  );
}

export function ShellGallery() {
  return (
    <main style={{ fontFamily: "var(--vt-font-body)", padding: "24px" }}>
      <h1 dir="ltr">Shell</h1>
      <p dir="ltr" style={{ maxInlineSize: "70ch" }}>
        Internal review scaffold, English only on purpose. The two components CLAUDE.md
        makes mandatory on every public page. Every real page gets these from{" "}
        <code>app/[locale]/layout.tsx</code>; this route is the one surface deliberately
        rendered without them, so the tiles below are the only shell on the page. Check
        this page at 1440, 1024, 768 and 390 px, and in German and Arabic.
      </p>

      <Tile caption="SiteHeader — variant='inverse' (the default; charcoal sticky bar). Scroll the tile: it stays put.">
        <SiteHeader />
        <Filler />
      </Tile>

      <Tile caption="SiteHeader — variant='overlay' over a photographic hero. Scroll the tile past 120 px to reach the floating charcoal-glass pane.">
        <SiteHeader variant="overlay" />
        <Filler ground />
      </Tile>

      <Tile caption="SiteHeader — cta={false}: the call to action is dropped on a page that already shows the booking card.">
        <SiteHeader cta={false} />
        <Filler />
      </Tile>

      <Tile caption="SiteHeader — hideAccount: the sign-in control is dropped.">
        <SiteHeader hideAccount />
        <Filler />
      </Tile>

      <Tile caption="SiteHeader — controlled (lang/cur/onLang/onCur supplied): reports a choice instead of changing the page. Fixed here to French / EUR.">
        <SiteHeader lang="fr" cur="EUR" onLang={() => {}} onCur={() => {}} />
        <Filler />
      </Tile>

      <section style={sectionStyle}>
        <p style={captionStyle} dir="ltr">
          SiteFooter — no required props: wordmark band and payment marks on by default.
        </p>
        <SiteFooter />
      </section>

      <section style={sectionStyle}>
        <p style={captionStyle} dir="ltr">
          SiteFooter — wordmark={"{false}"} showPaymentMarks={"{false}"}
          showChauffeurByHour={"{false}"}.
        </p>
        <SiteFooter wordmark={false} showPaymentMarks={false} showChauffeurByHour={false} />
      </section>
    </main>
  );
}
