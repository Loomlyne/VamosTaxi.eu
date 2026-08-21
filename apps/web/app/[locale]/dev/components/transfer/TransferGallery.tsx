"use client";

import type { CSSProperties, ReactNode } from "react";
import { Table } from "@/components/data";
import type { TableColumn } from "@/components/data";
import { PriceSummary, RouteSummary, StatusBadge, VehicleCard } from "@/components/transfer";
import type { BookingStatus, PriceLine, RouteMetaItem } from "@/components/transfer";

// The transfer-category states gallery (D-28, UI-SPEC "Dev-Only States Gallery" +
// "Component State Matrix" + "E4 · Data display" + "E5 · StatusBadge"). Renders the
// four transfer composites (StatusBadge, RouteSummary, PriceSummary, VehicleCard) and
// every static state their matrix rows mark, reached by USING the component — a
// loading PriceSummary is rendered loading, a disabled VehicleCard is rendered
// disabled — never by forcing a class. Hover/press/focus (a live pointer/focus event,
// not a prop) cannot be expressed as a static server-rendered tile, same reasoning
// core/CoreGallery.tsx, forms/FormsGallery.tsx and data/DataGallery.tsx already
// established; those are proven in tests/visual/transfer.spec.ts via real Playwright
// hover()/focus() simulation.
//
// Volume fixtures (UI-SPEC E4 "zero-one-many", the Copywriting Contract's own
// five-component list): RouteSummary and PriceSummary — the two of this batch's four
// components whose layout changes with how much data they hold — each render a
// zero/one/many trio beside their populated fixture, plus a partial fixture per this
// plan's own Task 3 instruction (a route without a return leg, a price summary
// without a discount line). StatusBadge's own "zero-one-many" is its closed nine-
// value lifecycle set, rendered side by side below AND again inside a Table cell —
// the German label-length question (E5's one unresolved row) is specifically about a
// badge inside a table cell, which a standalone badge does not test.
//
// English only, on purpose (CLAUDE.md's review-scaffold exemption) — this route
// carries no keys in apps/web/i18n/messages/*.json (StatusBadge's and RouteSummary's
// OWN labels below resolve through the real dictionary via next-intl — see those two
// components' own source — only this gallery's scaffold prose/captions stay English).
// The gallery uses the real next-intl locale runtime (nests under app/[locale]/, the
// same route tree every real page uses), so /ar/dev/components/transfer flips the
// whole page to RTL through the same code path a customer page would take.
//
// Client component: VehicleCard's onSelect demo tile needs a real handler function —
// Next's App Router refuses to pass a function prop from a Server Component into any
// DOM event handler, even when the receiving component isn't itself a client
// boundary (same reasoning the three sibling galleries' own comments give). The
// route's page.tsx stays a thin async Server Component that only resolves the locale
// segment, so the route keeps its SSG eligibility.

const noop = () => {};

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
  maxInlineSize: "300px",
};

const wideTileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "8px",
  minInlineSize: "320px",
  maxInlineSize: "420px",
};

const captionStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--vt-text-muted)",
  textAlign: "center",
};

// RouteSummary's and PriceSummary's `inverse` props only recolour their own text/
// border (RouteSummary.css/PriceSummary.css) — they rely on their parent already
// being a dark surface (same as ListRow's own `inverse`, see
// data/DataGallery.tsx's identical wrapper and comment).
const inverseWrapStyle: CSSProperties = {
  background: "var(--vt-charcoal-900)",
  padding: "16px",
  borderRadius: "var(--vt-radius-lg)",
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
  wide,
  children,
}: {
  caption: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={wide ? wideTileStyle : tileStyle}>
      {children}
      <span dir="ltr" style={captionStyle}>
        {caption}
      </span>
    </div>
  );
}

// ── StatusBadge fixtures ─────────────────────────────────────────────────────────

// The nine lifecycle values (BookingStatus) — this literal list, not re-derived, is
// what proves every value the union carries actually renders (T-01-29's closed-set
// guarantee is a compile-time property; this is the runtime rendering proof).
const ALL_STATUSES: BookingStatus[] = [
  "quote",
  "pending",
  "paid",
  "confirmed",
  "assigned",
  "completed",
  "cancelled",
  "refunded",
  "no-show",
];

interface StatusRow {
  id: string;
  reference: string;
  status?: BookingStatus;
  // See data/DataGallery.tsx's BookingRow comment — Table's `Row` generic requires
  // an index signature for its default cell-content branch to type-check.
  [key: string]: unknown;
}

// All nine statuses rendered again inside a table cell — the German label-length
// question (E5's unresolved row) is specifically about a badge inside a cell, not a
// standalone badge; "Zahlung ausstehend" (pending, German) is the longest lifecycle
// label in the dictionary and must widen the badge without clipping the cell.
const STATUS_TABLE_ROWS: StatusRow[] = ALL_STATUSES.map((status, i) => ({
  id: `s-${i}`,
  reference: `VT-${4820 + i}`,
  status,
}));
// One more row with an absent status — no badge renders, the cell stays blank
// (T-01-29: an absent/unrecognised status renders no badge, never a fallback tone).
STATUS_TABLE_ROWS.push({ id: "s-9", reference: "VT-4829" });

const STATUS_TABLE_COLUMNS: TableColumn<StatusRow>[] = [
  { key: "reference", header: "REFERENCE", width: "140px" },
  { key: "status", header: "STATUS", render: (row) => <StatusBadge status={row.status} /> },
];

// ── RouteSummary fixtures ────────────────────────────────────────────────────────

const ONE_WAY_META: RouteMetaItem[] = [
  { icon: "car-front", label: "Economy" },
];

const RETURN_META: RouteMetaItem[] = [
  { icon: "car-front", label: "Business" },
  { icon: "clock", label: <span className="vt-dir-keep">08:15</span> },
  { icon: "arrow-right", label: "Return: Sun 18:00" },
];

const MANY_META: RouteMetaItem[] = [
  { icon: "car-front", label: "Van" },
  { icon: "clock", label: <span className="vt-dir-keep">08:15</span> },
  { icon: "users", label: <span className="vt-dir-keep">4</span> },
  { icon: "luggage", label: <span className="vt-dir-keep">3</span> },
  { icon: "arrow-right", label: "Return: Sun 18:00" },
];

// ── PriceSummary fixtures ────────────────────────────────────────────────────────

const ONE_LINE: PriceLine[] = [{ label: "Transfer fare", icon: "car-front" }];

const MANY_LINES: PriceLine[] = [
  { label: "Transfer fare", icon: "car-front" },
  { label: "Meet & greet", icon: "user" },
  { label: "Child seat", icon: "baby" },
  { label: "Loyalty discount", credit: true },
  { label: "Booking fee", muted: true },
];

// Partial fixture — a price summary without a discount line (the plan's own named
// example): contrasted directly against MANY_LINES above, which has one — the total
// row's position and the layout around it must not shift either way.
const NO_DISCOUNT_LINES: PriceLine[] = [
  { label: "Transfer fare", icon: "car-front" },
  { label: "Meet & greet", icon: "user" },
];

export function TransferGallery() {
  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)" }}>
      <h1 dir="ltr">Transfer composites</h1>
      <p dir="ltr" style={{ color: "var(--vt-text-secondary)", maxWidth: "640px" }}>
        The four transfer composites (StatusBadge, RouteSummary, PriceSummary,
        VehicleCard). RouteSummary and PriceSummary each render a zero/one/many
        volume trio beside their populated fixture, plus a partial fixture where an
        optional field is absent. StatusBadge&apos;s own labels resolve through the
        real dictionary (next-intl) — check this page at <code>/de</code> and{" "}
        <code>/ar</code> for the real translated lifecycle labels, not placeholder
        text. Hover/press/focus are proven in tests/visual/transfer.spec.ts instead
        of here.
      </p>

      <Section title="StatusBadge — all nine lifecycle values">
        {ALL_STATUSES.map((status) => (
          <Tile key={status} caption={status}>
            <StatusBadge status={status} />
          </Tile>
        ))}
        <Tile caption="absent status — renders no badge (T-01-29)">
          <StatusBadge status={undefined} />
        </Tile>
        <Tile caption="label override">
          <StatusBadge status="pending" label="Payment due in 2h" />
        </Tile>
        <Tile caption="showIcon=false">
          <StatusBadge status="confirmed" showIcon={false} />
        </Tile>
      </Section>

      <Section title="StatusBadge — inside a table cell (the German label-length test)">
        <Tile caption="all nine values plus one absent-status row, inside Table cells" wide>
          {/* Explicit type argument — Table's generic default doesn't always infer
              across JSX call sites once both columns and rows carry data (see
              data/DataGallery.tsx's BookingTable wrapper comment for the full
              reasoning); a single call site here doesn't need a wrapper. */}
          <Table<StatusRow> columns={STATUS_TABLE_COLUMNS} rows={STATUS_TABLE_ROWS} />
        </Tile>
      </Section>

      <Section title="RouteSummary — zero, one, many meta items">
        <Tile caption="zero — empty state (no route entered yet)" wide>
          <RouteSummary empty emptyMessage="Enter a pickup and drop-off to see your route." />
        </Tile>
        <Tile caption="one meta item — partial: a one-way transfer, no return leg" wide>
          <RouteSummary
            pickup="Zurich Airport (ZRH)"
            pickupDetail="Terminal 2, Arrivals"
            dropoff="Baur au Lac"
            dropoffDetail="Talstrasse 1, Zurich"
            meta={ONE_WAY_META}
          />
        </Tile>
        <Tile caption="return leg reference in the meta row" wide>
          <RouteSummary
            pickup="Zurich Airport (ZRH)"
            pickupDetail="Terminal 2, Arrivals"
            dropoff="Dolder Grand"
            dropoffDetail="Kurhausstrasse 65, Zurich"
            meta={RETURN_META}
          />
        </Tile>
        <Tile caption="many meta items" wide>
          <RouteSummary
            pickup="Zurich Airport (ZRH)"
            pickupDetail="Terminal 2, Arrivals"
            dropoff="Widder Hotel"
            dropoffDetail="Rennweg 7, Zurich"
            meta={MANY_META}
          />
        </Tile>
        <Tile caption="loading (geocoding in progress)" wide>
          <RouteSummary loading loadingLabel="Looking up your route…" />
        </Tile>
        <Tile caption="inverse" wide>
          <div style={inverseWrapStyle}>
            <RouteSummary
              pickup="Zurich Airport (ZRH)"
              dropoff="Baur au Lac"
              meta={ONE_WAY_META}
              inverse
            />
          </div>
        </Tile>
      </Section>

      <Section title="PriceSummary — zero, one, many lines">
        <Tile caption="zero — empty state" wide>
          <PriceSummary empty emptyMessage="Your price will appear here once a route is set." />
        </Tile>
        <Tile caption="one line" wide>
          <PriceSummary lines={ONE_LINE} totalLabel="Total" />
        </Tile>
        <Tile caption="many lines, with a discount (credit) line" wide>
          <PriceSummary
            lines={MANY_LINES}
            totalLabel="Total"
            note={<span data-tok>free cancellation window</span>}
          />
        </Tile>
        <Tile caption="partial — no discount line (contrast with the fixture above)" wide>
          <PriceSummary lines={NO_DISCOUNT_LINES} totalLabel="Total" />
        </Tile>
        <Tile caption="loading (price still computing)" wide>
          <PriceSummary loading loadingLabel="Calculating your price…" />
        </Tile>
        <Tile caption="error" wide>
          <PriceSummary error="Couldn't calculate your price. Try again." />
        </Tile>
        <Tile caption="inverse" wide>
          <div style={inverseWrapStyle}>
            <PriceSummary lines={ONE_LINE} totalLabel="Total" inverse />
          </div>
        </Tile>
      </Section>

      <Section title="VehicleCard — states">
        <Tile caption="default (icon fallback, no image)" wide>
          <VehicleCard
            name="Economy"
            examples="Mercedes E-Class or similar"
            price="CHF 000"
            priceNote="Total, all taxes included"
            passengers={3}
            luggage={2}
          />
        </Tile>
        <Tile caption="selected, with badge and features" wide>
          <VehicleCard
            name="Business"
            examples="Mercedes V-Class or similar"
            price="CHF 000"
            priceNote="Total, all taxes included"
            passengers={4}
            luggage={3}
            badge="Popular"
            features={[{ icon: "snowflake", label: "Climate control" }]}
            selected
            onSelect={noop}
          />
        </Tile>
        <Tile caption="disabled — capacity exceeded" wide>
          <VehicleCard
            name="Economy"
            examples="Mercedes E-Class or similar"
            price="CHF 000"
            passengers={3}
            luggage={2}
            disabled
          />
        </Tile>
        <Tile caption="loading — price still computing" wide>
          <VehicleCard
            name="Van"
            examples="Mercedes V-Class XL or similar"
            passengers={7}
            luggage={6}
            loading
          />
        </Tile>
      </Section>
    </main>
  );
}
