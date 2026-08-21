"use client";

import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/core";
import { Alert, Dialog, ProgressIndicator, Toast, Tooltip } from "@/components/feedback";

// The feedback-category states gallery (D-28, UI-SPEC "Dev-Only States Gallery" +
// "Component State Matrix" + § E6 "Feedback set"). Renders every one of the five
// feedback components and every static state its matrix row marks, reached by USING
// the component — a danger-tone Alert, a running ProgressIndicator, an already-open
// Dialog — never by forcing a class directly. Hover/press (a live pointer event, not
// a prop) cannot be expressed as a static server-rendered tile, same reasoning
// core/CoreGallery.tsx and forms/FormsGallery.tsx already established; those are
// proven in tests/visual/feedback.spec.ts via real Playwright hover() simulation.
// Focus trap, focus restoration, the scroll-lock cycle and the toast live region are
// the four behaviours a screenshot diff cannot see at all (E6's own "Phase 1
// automates these" resolution) — proven in
// tests/integration/feedback-behaviour.spec.ts against the fixtures this file
// renders, not re-asserted here.
//
// English only, on purpose (CLAUDE.md's review-scaffold exemption) — this route
// carries no keys in apps/web/i18n/messages/*.json. The gallery uses the real
// next-intl locale runtime (nests under app/[locale]/, the same route tree every
// real page uses), so /ar/dev/components/feedback flips the whole page to RTL
// through the same code path a customer page would take — not a cosmetic toggle.
//
// Client component: Dialog and Tooltip both carry real internal state (Dialog's
// open/close effect chain, Tooltip's hover/focus-driven `on` state), and this
// gallery's own AutoOpenDialogDemo needs a real onClose/onClick function — all of
// which need a real client-side function, which Next's App Router refuses to let a
// Server Component pass across the boundary ("Event handlers cannot be passed to
// Client Component props"), same reasoning core/CoreGallery.tsx's own comment gives
// for its Tag demo tiles. The route's page.tsx stays a thin async Server Component
// that only resolves the locale segment, so the route keeps its SSG eligibility.

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
  maxInlineSize: "340px",
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

function Tile({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={tileStyle}>
      {children}
      <span dir="ltr" style={captionStyle}>
        {caption}
      </span>
    </div>
  );
}

const LONG_BODY =
  "Your driver waited past the included grace period and the trip could not go ahead as booked. We've refunded the fare in full to your original payment method — this can take up to five business days to appear, depending on your bank. If you still don't see it after that window, contact support with your booking reference and we'll look into it directly.";

// Enough paragraphs to overflow Dialog.css's own `max-block-size:88vh` at every
// viewport this project checks (900px tall in playwright.config.ts, taller in a real
// browser window) — proving "a dialog body scrolls inside itself and the page behind
// it does not" (must_haves) needs a body tall enough to actually have somewhere to
// scroll. tests/integration/feedback-behaviour.spec.ts scrolls this exact fixture.
const DIALOG_BODY_PARAGRAPHS = Array.from(
  { length: 16 },
  (_, i) =>
    `Section ${i + 1}. Cancelling more than 24 hours before pickup refunds the fare in full. Inside that window, the fare covers the driver's reserved time and is not refundable — this paragraph exists to give the dialog's own scrolling region enough height to overflow its container, proving the body scrolls inside itself while the page behind it does not.`,
);

function AutoShowTooltip({
  children,
  ...rest
}: { children: ReactNode } & ComponentProps<typeof Tooltip>) {
  // Tooltip's "shown" state is internal `useState` toggled by hover/focus — not a
  // controllable prop (Component State Matrix: "open" is not a distinct interaction
  // state). Reached here by using the component's own focus affordance
  // (`autoFocus` on a real focusable child triggers Tooltip's `onFocus` handler,
  // which bubbles from the child through React's synthetic event system to the
  // wrapping `<span>` Tooltip itself owns) rather than by forcing
  // `.vt-tip__bubble--on` directly — the same "reached by using the component"
  // contract every other tile in this gallery follows.
  return (
    <Tooltip {...rest}>
      <button type="button" autoFocus className="vt-btn vt-btn--ghost vt-btn--md">
        {children}
      </button>
    </Tooltip>
  );
}

function AutoOpenDialogDemo() {
  const [open, setOpen] = useState(false);
  const triggerWrapRef = useRef<HTMLDivElement>(null);

  // Opens itself once, on mount — reached by using the component's own open/close
  // state, not hidden behind a button a reviewer has to find (01-10-PLAN.md Task 3's
  // own instruction for this fixture: "an open dialog... rendered as fixtures, not
  // behind a button a reviewer has to find"). The synchronous `.focus()` call below
  // runs *before* `setOpen(true)` schedules the re-render that mounts Dialog's open
  // panel, so by the time Dialog's own effect reads `document.activeElement` (on the
  // next commit, once `open` flips to true), it correctly captures this trigger
  // button — not `document.body`, which is what a dialog whose `open` prop starts
  // `true` from its very first render would capture instead. This button is also the
  // exact focusable element tests/integration/feedback-behaviour.spec.ts asserts
  // focus returns to once the dialog closes.
  useEffect(() => {
    triggerWrapRef.current?.querySelector("button")?.focus();
    setOpen(true);
  }, []);

  return (
    <>
      {/* data-testid on this plain wrapping <div>, not on <Button> itself —
          Button's own prop type (ButtonProps, ButtonHTMLAttributes-derived) has no
          index signature for an arbitrary `data-*` attribute, so TypeScript's JSX
          checker rejects an unknown prop on a *custom* component even though the
          identical attribute is unconditionally allowed on any plain intrinsic
          element like this div (a long-standing TS/JSX carve-out for intrinsic
          elements only). tests/integration/feedback-behaviour.spec.ts queries this
          wrapper to find the real trigger button underneath. */}
      <div ref={triggerWrapRef} style={{ display: "inline-block" }} data-testid="dialog-trigger">
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
      </div>
      <Dialog
        open={open}
        title="Cancel this booking?"
        subtitle="This can't be undone."
        closeLabel="Close"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep booking
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Cancel booking
            </Button>
          </>
        }
      >
        {DIALOG_BODY_PARAGRAPHS.map((text, i) => (
          <p key={i} style={{ margin: i === 0 ? "0 0 12px" : "0 0 12px" }}>
            {text}
          </p>
        ))}
      </Dialog>
    </>
  );
}

export function FeedbackGallery() {
  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)" }}>
      <h1 dir="ltr">Feedback</h1>
      <p dir="ltr" style={{ color: "var(--vt-text-secondary)", maxWidth: "640px" }}>
        The five feedback components (Alert, Dialog, ProgressIndicator, Toast,
        Tooltip). Every static state its row in the Component State Matrix marks is a
        tile below, reached by using the component. Hover/press are interaction-only
        states, proven in tests/visual/feedback.spec.ts instead of here. Focus trap,
        focus restoration, the scroll-lock cycle and the live region are proven in
        tests/integration/feedback-behaviour.spec.ts against the Dialog and Toast
        fixtures below.
      </p>

      <Section title="Alert">
        <Tile caption="tone=info">
          <Alert tone="info" title="Fixed price">
            Your quote does not change once confirmed.
          </Alert>
        </Tile>
        <Tile caption="tone=success">
          <Alert tone="success" title="Booking confirmed">
            Your driver will be waiting at arrivals.
          </Alert>
        </Tile>
        <Tile caption="tone=danger">
          <Alert tone="danger" title="Check the flight number">
            We couldn&apos;t match that flight — check the number and try again.
          </Alert>
        </Tile>
        <Tile caption="tone=inverse">
          <Alert tone="inverse" title="No charge until the last step">
            You can review everything before you pay.
          </Alert>
        </Tile>
        <Tile caption="long body (wraps, does not truncate)">
          <Alert tone="danger" title="Trip could not go ahead">
            {LONG_BODY}
          </Alert>
        </Tile>
      </Section>

      <Section title="Toast">
        <Tile caption="tone=neutral">
          <Toast tone="neutral">Copied to clipboard</Toast>
        </Tile>
        <Tile caption="tone=success, dismissible (live region — see behaviour spec)">
          {/* data-testid on this plain wrapping <div>, not on <Toast> itself — same
              "intrinsic elements accept arbitrary data-* attributes, custom
              components don't" reasoning AutoOpenDialogDemo's trigger wrapper
              documents above. */}
          <div data-testid="toast-demo">
            <Toast tone="success" onClose={() => {}} dismissLabel="Dismiss">
              Booking confirmed
            </Toast>
          </div>
        </Tile>
        <Tile caption="tone=danger">
          <Toast tone="danger">Payment failed — try again</Toast>
        </Tile>
        <Tile caption="long body (wraps, does not truncate)">
          <Toast tone="danger">{LONG_BODY}</Toast>
        </Tile>
      </Section>

      <Section title="Tooltip">
        <Tile caption="shown — placement=top (reached via a real focus event, see AutoShowTooltip)">
          <AutoShowTooltip label="Fixed price, no surge" placement="top">
            Fixed price
          </AutoShowTooltip>
        </Tile>
        <Tile caption="shown — placement=bottom">
          <AutoShowTooltip label="Included in every fare" placement="bottom">
            No hidden fees
          </AutoShowTooltip>
        </Tile>
        <Tile caption="shown — placement=right">
          <AutoShowTooltip label="Cancel free up to 24h before pickup" placement="right">
            Free cancellation
          </AutoShowTooltip>
        </Tile>
      </Section>

      <Section title="ProgressIndicator">
        <Tile caption="running">
          <ProgressIndicator value={45} label="Confirming your driver" valueLabel="45%" />
        </Tile>
        <Tile caption="failed (error step)">
          <ProgressIndicator value={100} tone="danger" label="Payment" valueLabel="Failed" />
        </Tile>
        <Tile caption="size=sm, inline label scale">
          <ProgressIndicator value={70} size="sm" label="Uploading photo" />
        </Tile>
        <Tile caption="segmented">
          <ProgressIndicator value={3} segments={4} label="Booking steps" />
        </Tile>
        <Tile caption="complete">
          <ProgressIndicator value={100} tone="success" label="Refund" valueLabel="Done" />
        </Tile>
        <Tile caption="tone=inverse">
          <span style={{ background: "var(--vt-charcoal-900)", padding: "16px", display: "block" }}>
            <ProgressIndicator value={60} inverse label="Matching a driver" valueLabel="60%" />
          </span>
        </Tile>
      </Section>

      <section style={{ marginBlockEnd: "40px" }}>
        <h2 dir="ltr" style={{ fontSize: "17px", marginBlockEnd: "4px" }}>
          Dialog
        </h2>
        <p dir="ltr" style={{ ...captionStyle, textAlign: "start", maxWidth: "640px" }}>
          Opens itself on mount (no button to find), traps focus while open, restores
          it to the trigger below on close, locks the page behind it, and scrolls its
          own tall body without moving the page. Press Escape or click the backdrop to
          close it and keep reviewing the rest of this page.
        </p>
        <div style={rowStyle}>
          <AutoOpenDialogDemo />
        </div>
      </section>
    </main>
  );
}
