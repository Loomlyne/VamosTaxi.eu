"use client";

import type { CSSProperties, ReactNode } from "react";
import { List, ListRow, StatTile, Table } from "@/components/data";
import type { TableColumn } from "@/components/data";
import { StatusBadge } from "@/components/transfer";
import type { BookingStatus } from "@/components/transfer";

// The data-category states gallery (D-28, UI-SPEC "Dev-Only States Gallery" +
// "Component State Matrix" + "E4 · Data display"). Renders the four data components
// (Table, List, ListRow, StatTile) and every static state their matrix rows mark,
// reached by USING the component — a loading Table is rendered loading, an empty
// List is rendered with no children, a selected ListRow is rendered selected — never
// by forcing a class. Hover/press/focus (a live pointer/focus event, not a prop)
// cannot be expressed as a static server-rendered tile, same reasoning
// core/CoreGallery.tsx and forms/FormsGallery.tsx already established; those are
// proven in tests/visual/data.spec.ts via real Playwright hover()/focus() simulation.
//
// Volume fixtures (UI-SPEC E4 "zero-one-many", the Copywriting Contract's own
// five-component list): Table, List and StatTile — the three of this batch's four
// components whose layout changes with how much data they hold — each render a
// zero/one/many trio beside their populated fixture, plus a partial fixture (a row
// with an optional field absent) per this plan's own Task 3 instruction. ListRow is
// a single row, not a collection, so it gets the matrix's other states (icon lead,
// meta, chevron, selected, inverse, clickable) instead of a volume trio.
//
// English only, on purpose (CLAUDE.md's review-scaffold exemption) — this route
// carries no keys in apps/web/i18n/messages/*.json. The gallery uses the real
// next-intl locale runtime (nests under app/[locale]/, the same route tree every
// real page uses), so /ar/dev/components/data flips the whole page to RTL through
// the same code path a customer page would take — not a cosmetic toggle.
//
// Client component: Table's onRowClick and ListRow's onClick demo tiles need a real
// handler function — Next's App Router refuses to pass a function prop from a Server
// Component into any DOM event handler, even when the receiving component isn't
// itself a client boundary (same reasoning core/CoreGallery.tsx's and
// forms/FormsGallery.tsx's own comments give). The route's page.tsx stays a thin
// async Server Component that only resolves the locale segment, so the route keeps
// its SSG eligibility.

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
  maxInlineSize: "560px",
};

const captionStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--vt-text-muted)",
  textAlign: "center",
};

// ListRow's `inverse` prop only recolours its own text/border (ListRow.css) — it
// relies on its parent already being a dark surface, same as RouteSummary's and
// PriceSummary's own `inverse` props (see transfer/TransferGallery.tsx's identical
// wrapper). StatTile's `inverse` tone, by contrast, paints its own background
// (`--vt-bg-inverse`) and needs no wrapper — used bare below.
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

// ── Table fixtures ───────────────────────────────────────────────────────────────

interface BookingRow {
  id: string;
  reference: string;
  route: string;
  status?: BookingStatus;
  price: string;
  // Table's `Row` generic is constrained to `Record<string, unknown>` (an index
  // signature) so its default cell-content branch (`r[c.key] as ReactNode`,
  // Table.tsx) type-checks for any column key — a real fixture's own concrete
  // fields above still narrow every column's actual type via TableColumn<BookingRow>.
  [key: string]: unknown;
}

const TABLE_COLUMNS: TableColumn<BookingRow>[] = [
  { key: "reference", header: "REFERENCE", width: "140px" },
  { key: "route", header: "ROUTE" },
  {
    key: "status",
    header: "STATUS",
    render: (row) => <StatusBadge status={row.status} />,
  },
  { key: "price", header: "PRICE", align: "right", width: "110px" },
];

const ONE_BOOKING: BookingRow[] = [
  { id: "b-1", reference: "VT-4821", route: "ZRH → Baur au Lac", status: "confirmed", price: "CHF 000" },
];

const MANY_BOOKINGS: BookingRow[] = [
  { id: "b-1", reference: "VT-4821", route: "ZRH → Baur au Lac", status: "confirmed", price: "CHF 000" },
  { id: "b-2", reference: "VT-4822", route: "ZRH → Dolder Grand", status: "assigned", price: "CHF 000" },
  { id: "b-3", reference: "VT-4823", route: "ZRH → Widder Hotel", status: "pending", price: "CHF 000" },
  { id: "b-4", reference: "VT-4824", route: "Baur au Lac → ZRH", status: "completed", price: "CHF 000" },
  { id: "b-5", reference: "VT-4825", route: "ZRH → Storchen Zurich", status: "cancelled", price: "CHF 000" },
];

// Partial fixture — an optional field absent (this row's status is not yet known):
// the STATUS column must render an empty cell, never collapse the column or shift
// the PRICE column beside it (T-01-29 — an absent status renders no badge).
const PARTIAL_BOOKINGS: BookingRow[] = [
  { id: "b-6", reference: "VT-4826", route: "ZRH → Park Hyatt", status: "confirmed", price: "CHF 000" },
  { id: "b-7", reference: "VT-4827", route: "ZRH → Eden au Lac", price: "CHF 000" },
];

// A thin, concretely-typed wrapper — `Table`'s own generic default
// (`Row extends Record<string, unknown> = Record<string, unknown>`) does not always
// infer `BookingRow` correctly across JSX call sites once both `columns` and `rows`
// carry data (TypeScript's JSX generic inference struggles to unify two separately-
// typed props against one shared type parameter); pinning the parameter once here,
// rather than repeating `<Table<BookingRow> ...>` at every call site below, keeps
// every fixture's usage identical to how a real caller (Phase 6/8) would write it.
function BookingTable(props: {
  columns: TableColumn<BookingRow>[];
  rows: BookingRow[];
  selectedId?: string;
  onRowClick?: (row: BookingRow) => void;
  loading?: boolean;
  loadingLabel?: ReactNode;
  error?: ReactNode;
  emptyMessage?: ReactNode;
}) {
  return <Table<BookingRow> {...props} />;
}

export function DataGallery() {
  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)" }}>
      <h1 dir="ltr">Data components</h1>
      <p dir="ltr" style={{ color: "var(--vt-text-secondary)", maxWidth: "640px" }}>
        The four data components (Table, List, ListRow, StatTile). Table, List and
        StatTile each render a zero/one/many volume trio beside their populated
        fixture, plus a partial fixture where an optional field is absent — layout
        must not collapse or shift in either case. Hover/press/focus are proven in
        tests/visual/data.spec.ts instead of here.
      </p>

      <Section title="Table — zero rows (empty state)">
        <Tile caption="empty — stated in words, never a fake number" wide>
          <BookingTable
            columns={TABLE_COLUMNS}
            rows={[]}
            emptyMessage="Awaiting live data."
          />
        </Tile>
      </Section>

      <Section title="Table — one row">
        <Tile caption="one booking" wide>
          <BookingTable columns={TABLE_COLUMNS} rows={ONE_BOOKING} />
        </Tile>
      </Section>

      <Section title="Table — many rows, selected, clickable">
        <Tile caption="many bookings, one selected (data-selected), rows clickable" wide>
          <BookingTable
            columns={TABLE_COLUMNS}
            rows={MANY_BOOKINGS}
            selectedId="b-2"
            onRowClick={noop}
          />
        </Tile>
      </Section>

      <Section title="Table — partial (status absent), loading, error">
        <Tile caption="one row's status is not yet known — column stays, cell is blank" wide>
          <BookingTable columns={TABLE_COLUMNS} rows={PARTIAL_BOOKINGS} />
        </Tile>
        <Tile caption="loading" wide>
          <BookingTable
            columns={TABLE_COLUMNS}
            rows={[]}
            loading
            loadingLabel="Loading bookings…"
          />
        </Tile>
        <Tile caption="error" wide>
          <BookingTable
            columns={TABLE_COLUMNS}
            rows={[]}
            error="Couldn't load your bookings. Try again."
          />
        </Tile>
      </Section>

      <Section title="List — zero, one, many, loading">
        <Tile caption="empty">
          <List emptyMessage="Awaiting live data." />
        </Tile>
        <Tile caption="one row">
          <List>
            <ListRow title="Zurich Airport (ZRH)" subtitle="Terminal 2, Arrivals" last />
          </List>
        </Tile>
        <Tile caption="many rows">
          <List>
            <ListRow title="Baur au Lac" subtitle="Talstrasse 1, Zurich" />
            <ListRow title="Dolder Grand" subtitle="Kurhausstrasse 65, Zurich" />
            <ListRow title="Widder Hotel" subtitle="Rennweg 7, Zurich" last />
          </List>
        </Tile>
        <Tile caption="loading">
          <List loading loadingLabel="Loading…" />
        </Tile>
        <Tile caption="plain (inset=false)">
          <List inset={false}>
            <ListRow title="Meet & greet" last />
          </List>
        </Tile>
      </Section>

      <Section title="ListRow — states">
        <Tile caption="default (title only)">
          <List>
            <ListRow title="Meet & greet" last />
          </List>
        </Tile>
        <Tile caption="with subtitle">
          <List>
            <ListRow title="Baur au Lac" subtitle="Talstrasse 1, Zurich" last />
          </List>
        </Tile>
        <Tile caption="icon lead (untinted, white surface)">
          <List>
            <ListRow title="Vehicle assigned" subtitle="Mercedes V-Class" icon="car-front" last />
          </List>
        </Tile>
        <Tile caption="with meta">
          <List>
            <ListRow title="VT-4821" subtitle="ZRH → Baur au Lac" meta={<StatusBadge status="confirmed" />} last />
          </List>
        </Tile>
        <Tile caption="chevron (mirrors under RTL)">
          <List>
            <ListRow title="Booking history" chevron last />
          </List>
        </Tile>
        <Tile caption="clickable (real button, hover/focus in data.spec.ts)">
          <List>
            <ListRow title="View booking" chevron onClick={noop} last />
          </List>
        </Tile>
        <Tile caption="selected">
          <List>
            <ListRow title="Economy" selected last />
          </List>
        </Tile>
        <Tile caption="partial — optional fields absent (no icon, no subtitle, no meta)">
          <List>
            <ListRow title="Special instructions" last />
          </List>
        </Tile>
        <Tile caption="last=false (border visible) vs last=true">
          <List>
            <ListRow title="First row" />
            <ListRow title="Last row" last />
          </List>
        </Tile>
        <Tile caption="inverse (icon lead on charcoal)">
          <div style={inverseWrapStyle}>
            <List inset={false}>
              <ListRow title="Vehicle assigned" subtitle="Mercedes V-Class" icon="car-front" inverse last />
            </List>
          </div>
        </Tile>
      </Section>

      <Section title="StatTile — zero, one, many, loading, tones">
        <Tile caption="zero — empty state">
          <StatTile label="Today's bookings" emptyMessage="Awaiting live data." />
        </Tile>
        <Tile caption="one">
          <StatTile label="Today's bookings" value="1" icon="calendar-days" />
        </Tile>
        <Tile caption="many">
          <StatTile label="This month" value="248" icon="calendar-days" foot="+12% vs last month" />
        </Tile>
        <Tile caption="loading">
          <StatTile label="Today's bookings" loading />
        </Tile>
        <Tile caption="tone=accent">
          <StatTile label="Revenue" value="CHF 000" tone="accent" icon="banknote" />
        </Tile>
        <Tile caption="tone=inverse">
          <StatTile label="Fleet online" value="6" tone="inverse" icon="car-front" />
        </Tile>
      </Section>
    </main>
  );
}
