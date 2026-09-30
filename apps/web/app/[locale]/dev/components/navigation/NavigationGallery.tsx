"use client";

import type { CSSProperties, ReactNode } from "react";
import { SectionHeader, StepIndicator, Tabs } from "@/components/navigation";

// The navigation-category states gallery (D-28, UI-SPEC "Dev-Only States Gallery" +
// "Component State Matrix"). Renders every one of the three navigation components
// and every static state its matrix row marks, reached by USING the component — a
// per-tab disabled Tabs item, an errored StepIndicator step, a ruled SectionHeader —
// never by forcing a class directly. Hover/press/focus (a live pointer/focus event,
// not a prop) cannot be expressed as a static server-rendered tile, same reasoning
// core/CoreGallery.tsx and forms/FormsGallery.tsx already established; those are
// proven in tests/visual/navigation.spec.ts via real Playwright hover()/focus()
// simulation.
//
// English only, on purpose (CLAUDE.md's review-scaffold exemption) — this route
// carries no keys in apps/web/i18n/messages/*.json. The gallery uses the real
// next-intl locale runtime (nests under app/[locale]/, the same route tree every
// real page uses), so /ar/dev/components/navigation flips the whole page to RTL
// through the same code path a customer page would take — not a cosmetic toggle.
//
// Client component: Tabs attaches a real onClick to every tab button regardless of
// whether an onChange prop is supplied (Tabs.tsx: `onClick={() => !disabled &&
// onChange?.(id)}`), and SectionHeader's action-link slot attaches its own
// preventDefault handler — both need a real client-side function, which Next's App
// Router refuses to let a Server Component pass across the boundary ("Event
// handlers cannot be passed to Client Component props"), same reasoning
// core/CoreGallery.tsx's own comment gives for its Tag demo tiles. The route's
// page.tsx stays a thin async Server Component that only resolves the locale
// segment, so the route keeps its SSG eligibility.

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "24px",
  alignItems: "flex-start",
  paddingBlock: "16px",
  borderBlockEnd: "1px solid var(--vt-border-subtle)",
};

const tileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "8px",
  minInlineSize: "220px",
  maxInlineSize: "320px",
};

const wideTileStyle: CSSProperties = {
  ...tileStyle,
  // No raised minInlineSize here (unlike an earlier version of this fix) — a hard
  // 380px floor is wider than a 390px viewport's own content width once page
  // padding is subtracted, which forced the whole *page* to scroll sideways at
  // 390px, a second real defect found during the same German/Arabic pass (violates
  // CLAUDE.md's "nothing may scroll sideways at 390px"). The tile itself now stays
  // free to shrink like every other tile in this gallery; wideScrollStyle below
  // gives its StepIndicator content its own horizontal scroll instead, so a 4-step
  // German-length flow that's still wider than the shrunk tile scrolls inside its
  // own box rather than expanding the page.
  maxInlineSize: "560px",
  // The classic flex-item gotcha, and the reason the page still scrolled sideways
  // even after dropping the hard minInlineSize above: a flex item's default
  // min-inline-size is `auto`, which resolves to its *content's own* intrinsic
  // minimum width — for a `white-space:nowrap` StepIndicator flow with no wrap
  // point of its own, that is its full unwrapped width, right back to forcing the
  // row (and the page) wider than the viewport. Overriding it to 0 is what actually
  // lets this tile shrink smaller than its content, handing the overflow to
  // wideScrollStyle's own internal scrollbar instead of the page's.
  minInlineSize: "0",
};

// StepIndicator's own CSS (`inline-size:100%`, `white-space:nowrap` labels, no
// `@media` rule at all — confirmed by reading StepIndicator.css directly) has no
// built-in accommodation for a container narrower than its natural content width.
// That is a genuine, pre-existing gap in the ported component's own responsiveness,
// not something this gallery's scaffolding may paper over by inventing new CSS
// behaviour for StepIndicator.css itself (out of this task's scope — Task 1, already
// committed, is the port). This wrapper is presentational-only, scoped to the
// gallery: it gives a StepIndicator tile its own horizontal scroll, the way Tabs' own
// overflow row already has one, so the *page* never scrolls sideways even when one
// tile's natural content does not fit.
const wideScrollStyle: CSSProperties = {
  overflowX: "auto",
  maxInlineSize: "100%",
};

const captionStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--vt-text-muted)",
  textAlign: "center",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBlockEnd: "40px" }}>
      {/* dir="ltr" scopes only this gallery's own English-on-purpose scaffold
          heading — never the tiles it wraps, same fix core/CoreGallery.tsx's
          Section already carries (found during the Arabic manual pass,
          01-06-SUMMARY.md § Deviations). */}
      <h2 dir="ltr" style={{ fontSize: "17px", marginBlockEnd: "4px" }}>
        {title}
      </h2>
      <div style={rowStyle}>{children}</div>
    </section>
  );
}

function Tile({
  caption,
  children,
  wide = false,
}: {
  caption: string;
  children: ReactNode;
  /** StepIndicator's multi-step flow (`inline-size:100%` on `.vt-steps`, no overflow
   * control of its own — confirmed by reading StepIndicator.css directly) needs more
   * room than the 220–320px band every other tile in this gallery fits inside;
   * without it, a real defect was found and fixed here during the German manual
   * pass: a 4-step flow with German-length labels doesn't fit `tileStyle`'s own
   * max-width, and with nothing clipping the overflow, its trailing label text
   * visually bleeds into the next tile over rather than wrapping or being clipped. */
  wide?: boolean;
}) {
  return (
    <div style={wide ? wideTileStyle : tileStyle}>
      {wide ? (
        <div style={wideScrollStyle}>
          {children}
        </div>
      ) : (
        children
      )}
      <span dir="ltr" style={captionStyle}>
        {caption}
      </span>
    </div>
  );
}

const LONG_TITLE =
  "A section title deliberately written long enough to prove it wraps onto a second line rather than clipping or truncating at the container's edge";

export function NavigationGallery() {
  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)" }}>
      <h1 dir="ltr">Navigation</h1>
      <p dir="ltr" style={{ color: "var(--vt-text-secondary)", maxWidth: "640px" }}>
        The three navigation components (SectionHeader, StepIndicator, Tabs). Every
        static state its row in the Component State Matrix marks is a tile below,
        reached by using the component. Hover/press/focus are interaction-only
        states, proven in tests/visual/navigation.spec.ts instead of here.
      </p>

      <Section title="Tabs">
        <Tile caption="segmented, default">
          <Tabs items={["Airport", "Hotel", "Custom"]} value="Airport" />
        </Tile>
        <Tile caption="segmented, per-tab disabled">
          <Tabs
            items={[
              { value: "economy", label: "Economy" },
              { value: "business", label: "Business" },
              { value: "van", label: "Van", disabled: true },
            ]}
            value="economy"
          />
        </Tile>
        <Tile caption="variant=underline">
          <Tabs variant="underline" items={["Overview", "Itinerary", "Payment"]} value="Itinerary" />
        </Tile>
        <Tile caption="block (fills its container)">
          <div style={{ inlineSize: "260px" }}>
            <Tabs block items={["One way", "Round trip"]} value="One way" />
          </div>
        </Tile>
        <Tile caption="overflow — row scrolls horizontally rather than wrapping (German-length labels)">
          {/* `.vt-tabs` is `display:inline-flex` (sizes to its own content, like any
              inline-level box) — a plain width on this wrapper alone does nothing to
              constrain it, since an inline-flex child never stretches to fill a
              narrower ancestor on its own; found here the same way the StepIndicator
              overlap above was: a real render at a narrow viewport, not assumed from
              reading the CSS. `block` switches to `.vt-tabs--block{inline-size:100%}`,
              which *does* fill this 260px wrapper, so the row's own
              `overflow-x:auto` has a boundary narrower than its content to actually
              activate against. */}
          <div style={{ inlineSize: "260px" }}>
            <Tabs
              block
              items={["Flughafentransfer", "Stadtrundfahrt", "Geschäftsreise", "Sonderwunsch"]}
              value="Flughafentransfer"
            />
          </div>
        </Tile>
      </Section>

      <Section title="StepIndicator">
        <Tile wide caption="default (done / current / todo)">
          <StepIndicator steps={["Trip", "Vehicle", "Payment", "Confirm"]} current={1} />
        </Tile>
        <Tile wide caption="error (invalid step)">
          <StepIndicator
            steps={[{ label: "Trip" }, { label: "Vehicle", error: true }, { label: "Payment" }, { label: "Confirm" }]}
            current={1}
          />
        </Tile>
        <Tile wide caption="completed step (assistive-only announcement, no visible change)">
          <StepIndicator steps={["Trip", "Vehicle", "Payment"]} current={2} completedLabel="completed" />
        </Tile>
        <Tile wide caption="all steps done">
          <StepIndicator steps={["Trip", "Vehicle", "Payment", "Confirm"]} current={4} />
        </Tile>
        <Tile wide caption="long labels (German-length)">
          <StepIndicator
            steps={["Reiseangaben", "Fahrzeugauswahl", "Zahlungsmethode", "Bestätigung"]}
            current={1}
          />
        </Tile>
      </Section>

      <Section title="SectionHeader">
        <Tile caption="default (h2)">
          <SectionHeader eyebrow="Booking" title="Your transfer" subtitle="Fixed price, no surge." />
        </Tile>
        <Tile caption="level=h1">
          <SectionHeader title="Ride with class" level="h1" />
        </Tile>
        <Tile caption="level=label">
          <SectionHeader title="Vehicle class" level="label" />
        </Tile>
        <Tile caption="with rule">
          <SectionHeader title="Trip details" rule />
        </Tile>
        <Tile caption="with action link (chevron mirrors under RTL)">
          <SectionHeader title="Recent bookings" actionLabel="View all" />
        </Tile>
        <Tile caption="tone=inverse">
          <span style={{ background: "var(--vt-charcoal-900)", padding: "16px", display: "block" }}>
            <SectionHeader title="Departure" tone="inverse" eyebrow="Airport" />
          </span>
        </Tile>
        <Tile caption="long title (wraps, does not clip)">
          <SectionHeader title={LONG_TITLE} />
        </Tile>
      </Section>
    </main>
  );
}
