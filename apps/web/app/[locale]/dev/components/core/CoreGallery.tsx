"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CheckerMark,
  Icon,
  IconButton,
  Logo,
  Tag,
} from "@/components/core";

// The core-category states gallery (D-28, UI-SPEC "Dev-Only States Gallery" +
// "Component State Matrix"). Renders every one of the nine core primitives and
// every state its matrix row marks, reached by USING the component — a disabled
// Tag, a selected Card, an Avatar whose image source fails — never by forcing a
// class directly. Interaction states that only exist as a live pointer/focus
// event (hover, press, focus) cannot be expressed as a static server-rendered
// tile; those are proven in tests/visual/core.spec.ts via real Playwright
// hover()/focus() simulation, the same split button.spec.ts already established
// in Plan 03.
//
// English only, on purpose (CLAUDE.md's review-scaffold exemption) — this route
// carries no keys in apps/web/i18n/messages/*.json.
// The gallery uses the real next-intl locale runtime (this page nests under
// app/[locale]/, the same route tree every real page uses), so /ar/dev/
// components/core flips the whole page to RTL through the same code path a
// customer page would take — not a cosmetic toggle.

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
  alignItems: "center",
  gap: "8px",
  minInlineSize: "120px",
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
          heading — never the tiles it wraps. Found during the Arabic manual pass
          (see 01-06-SUMMARY.md § Deviations): without it, the bidi algorithm
          reorders trailing punctuation in this plain-English prose once the
          document's ambient dir="rtl" applies, which is a real, observed defect
          in the gallery's own copy, not in any of the nine components under
          test — those still render under the page's real dir="rtl" so their
          mirroring stays genuinely checked. */}
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

// Client component: two Tag tiles below need a real onClick/onRemove handler
// (Tag's `clickable`/native-`disabled` rendering, and its always-present remove
// button, both require an actual function — Next.js's App Router refuses to pass
// an event-handler prop across a Server Component boundary with no client owner
// to attach it, "Event handlers cannot be passed to Client Component props").
// The parent page.tsx stays a thin async Server Component that resolves and
// validates the locale segment; this file owns everything that needs a real
// handler. Locale/RTL still comes from the shared [locale] layout's <html
// dir>, unaffected by this component being client-rendered.
export function CoreGallery() {
  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)" }}>
      <h1 dir="ltr">Core components</h1>
      <p dir="ltr" style={{ color: "var(--vt-text-secondary)", maxWidth: "640px" }}>
        The nine core primitives (Avatar, Badge, Button, Card, CheckerMark, Icon,
        IconButton, Logo, Tag). Every state its row in the Component State Matrix
        marks is a tile below, reached by using the component.
      </p>

      <Section title="Icon">
        <Tile caption="default">
          <Icon name="car-front" size={24} />
        </Tile>
      </Section>

      <Section title="Logo">
        <Tile caption="default — primary / wordmark">
          <Logo variant="primary" form="wordmark" />
        </Tile>
        <Tile caption="default — reversed / mark">
          <span style={{ background: "var(--vt-charcoal-900)", padding: "8px", display: "inline-block" }}>
            <Logo variant="reversed" form="mark" height={40} />
          </span>
        </Tile>
      </Section>

      <Section title="CheckerMark">
        <Tile caption="default">
          <CheckerMark size={48} />
        </Tile>
      </Section>

      <Section title="Avatar">
        <Tile caption="default (image)">
          <Avatar name="Anna Keller" src="/brand/photography/fleet-van-street.jpg" />
        </Tile>
        <Tile caption="default (initials)">
          <Avatar name="Jonas Meier" />
        </Tile>
        <Tile caption="loading (no skeleton in source — same render as default until the fetch settles)">
          <Avatar name="Loading Now" src="/brand/photography/fleet-van-street.jpg" />
        </Tile>
        <Tile caption="empty">
          <Avatar />
        </Tile>
        <Tile caption="error (image 404s, falls back to initials — never a broken-image glyph)">
          <Avatar name="Load Error" src="/brand/photography/does-not-exist.jpg" />
        </Tile>
      </Section>

      <Section title="Badge">
        <Tile caption="tone=neutral">
          <Badge tone="neutral">Neutral</Badge>
        </Tile>
        <Tile caption="tone=accent">
          <Badge tone="accent">Accent</Badge>
        </Tile>
        <Tile caption="tone=success">
          <Badge tone="success">Success</Badge>
        </Tile>
        <Tile caption="tone=danger">
          <Badge tone="danger">Danger</Badge>
        </Tile>
        <Tile caption="tone=info">
          <Badge tone="info">Info</Badge>
        </Tile>
        <Tile caption="tone=inverse">
          <span style={{ background: "var(--vt-charcoal-900)", padding: "8px", display: "inline-block" }}>
            <Badge tone="inverse">Inverse</Badge>
          </span>
        </Tile>
        <Tile caption="tone=outline">
          <Badge tone="outline">Outline</Badge>
        </Tile>
        <Tile caption="with icon">
          <Badge tone="accent" icon="shield-check">
            Verified
          </Badge>
        </Tile>
      </Section>

      <Section title="Button">
        <Tile caption="default (primary)">
          <Button variant="primary">Book a transfer</Button>
        </Tile>
        <Tile caption="disabled">
          <Button variant="primary" disabled>
            Book a transfer
          </Button>
        </Tile>
        <Tile caption="variant=ghost">
          <Button variant="ghost">Ghost</Button>
        </Tile>
        <Tile caption="variant=danger">
          <Button variant="danger">Cancel booking</Button>
        </Tile>
      </Section>

      <Section title="Card">
        <Tile caption="default">
          <Card padding="md" style={{ inlineSize: "160px" }}>
            Default card
          </Card>
        </Tile>
        <Tile caption="selectable (hover / focus states — see core.spec.ts)">
          <Card
            as="button"
            type="button"
            selectable
            padding="md"
            style={{ inlineSize: "160px", textAlign: "start" }}
          >
            Selectable card
          </Card>
        </Tile>
        <Tile caption="selected">
          <Card as="button" type="button" selectable selected padding="md" style={{ inlineSize: "160px", textAlign: "start" }}>
            Selected card
          </Card>
        </Tile>
        <Tile caption="tone=inverse">
          <Card tone="inverse" padding="md" style={{ inlineSize: "160px" }}>
            Inverse card
          </Card>
        </Tile>
      </Section>

      <Section title="IconButton">
        <Tile caption="default">
          <IconButton icon="bell" label="Notifications" />
        </Tile>
        <Tile caption="variant=outline">
          <IconButton icon="pencil" label="Edit" variant="outline" />
        </Tile>
        <Tile caption="variant=solid">
          <IconButton icon="plus" label="Add" variant="solid" />
        </Tile>
        <Tile caption="disabled">
          <IconButton icon="trash-2" label="Delete" disabled />
        </Tile>
        <Tile caption="selected — no source to port from (see IconButton.tsx's note)">
          <span style={captionStyle}>not reachable from the component</span>
        </Tile>
      </Section>

      <Section title="Tag">
        <Tile caption="default">
          <Tag>Airport</Tag>
        </Tile>
        <Tile caption="with icon">
          <Tag icon="map-pin">Zurich</Tag>
        </Tile>
        <Tile caption="selected (active filter)">
          <Tag active onClick={() => {}}>
            Active filter
          </Tag>
        </Tile>
        <Tile caption="disabled (clickable + native disabled)">
          <Tag onClick={() => {}} disabled>
            Disabled
          </Tag>
        </Tile>
        <Tile caption="removable">
          <Tag onRemove={() => {}}>Removable</Tag>
        </Tile>
      </Section>
    </main>
  );
}
