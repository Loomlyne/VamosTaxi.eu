"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Checkbox,
  Counter,
  DatePicker,
  Input,
  Radio,
  Select,
  Switch,
  Textarea,
} from "@/components/forms";

// The forms-category states gallery (D-28, UI-SPEC "Dev-Only States Gallery" +
// "Component State Matrix"). Renders every one of the eight form controls and every
// static state its matrix row marks, reached by USING the control — a disabled
// Switch is rendered disabled, an invalid Checkbox is rendered with an error, a
// Select in its loading state is rendered loading — never by forcing a class.
// Hover/press/focus (a live pointer/focus event, not a prop) cannot be expressed as
// a static server-rendered tile, same reasoning core/CoreGallery.tsx already
// established; those are proven in tests/visual/forms.spec.ts via real Playwright
// hover()/focus() simulation. DatePicker's open calendar panel is the same kind of
// interaction-only state (its `open` flag is internal `useState`, not a prop) — also
// proven in forms.spec.ts via a real click, not a static tile here.
//
// English only, on purpose (CLAUDE.md's review-scaffold exemption) — this route
// carries no keys in apps/web/i18n/messages/*.json. The gallery uses the real
// next-intl locale runtime (nests under app/[locale]/, the same route tree every
// real page uses), so /ar/dev/components/forms flips the whole page to RTL through
// the same code path a customer page would take — not a cosmetic toggle.
//
// Client component: several tiles below need a real onChange handler (Checkbox/
// Radio/Switch's `checked` own-prop drives the rendered checkmark/dot icon
// independently of the native input's own DOM state — see Checkbox.tsx's comment —
// so a controlled `checked` tile needs a same-value onChange to avoid React's
// missing-handler warning). Next's App Router refuses to pass a function prop from a
// Server Component into any DOM event handler, even when the receiving component
// isn't itself a client boundary — same reasoning core/CoreGallery.tsx's own comment
// gives for its Tag demo tiles. The route's page.tsx stays a thin async Server
// Component that only resolves the locale segment, so the route keeps its SSG
// eligibility.

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
  maxInlineSize: "260px",
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

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const VEHICLE_OPTIONS = ["Economy", "Business", "Van"];

const LONG_LABEL =
  "A label deliberately written long enough to prove it wraps onto a second line rather than clipping or truncating at the field's edge";

export function FormsGallery() {
  return (
    <main style={{ padding: "32px", fontFamily: "var(--vt-font-body)" }}>
      <h1 dir="ltr">Form controls</h1>
      <p dir="ltr" style={{ color: "var(--vt-text-secondary)", maxWidth: "640px" }}>
        The eight form controls (Checkbox, Counter, DatePicker, Input, Radio, Select,
        Switch, Textarea). Every static state its row in the Component State Matrix
        marks is a tile below, reached by using the control. Hover/press/focus and
        DatePicker&apos;s open calendar panel are interaction-only states, proven in
        tests/visual/forms.spec.ts instead of here.
      </p>

      <Section title="Input">
        <Tile caption="default">
          <Input label="Pickup address" placeholder="Zurich Airport (ZRH)" />
        </Tile>
        <Tile caption="with hint">
          <Input label="Voucher code" hint="Your voucher goes here" />
        </Tile>
        <Tile caption="error (hint suppressed)">
          <Input
            label="Email"
            defaultValue="not-an-email"
            hint="We'll send your confirmation here"
            error="Check the email address"
          />
        </Tile>
        <Tile caption="disabled">
          <Input label="Reference" defaultValue="VT-4821" disabled />
        </Tile>
        <Tile caption="with icon + suffix">
          <Input label="Flight number" icon="plane-landing" suffix="ZRH" placeholder="LX 338" />
        </Tile>
        <Tile caption="long label">
          <Input label={LONG_LABEL} placeholder="Address" />
        </Tile>
      </Section>

      <Section title="Textarea">
        <Tile caption="default">
          <Textarea label="Special instructions" placeholder="Meet at arrivals, gate 3" />
        </Tile>
        <Tile caption="with hint">
          <Textarea label="Notes for the driver" hint="Optional, visible only to your driver" />
        </Tile>
        <Tile caption="error (hint suppressed)">
          <Textarea
            label="Cancellation reason"
            hint="Helps us improve"
            error="Tell us why you're cancelling"
          />
        </Tile>
        <Tile caption="disabled">
          <Textarea label="Internal note" defaultValue="Reviewed 12 Aug" disabled />
        </Tile>
        <Tile caption="long label">
          <Textarea label={LONG_LABEL} placeholder="Instructions" />
        </Tile>
      </Section>

      <Section title="Select">
        <Tile caption="default (placeholder)">
          <Select label="Vehicle class" placeholder="Choose a class" options={VEHICLE_OPTIONS} />
        </Tile>
        <Tile caption="selected">
          <Select label="Vehicle class" options={VEHICLE_OPTIONS} defaultValue="Business" />
        </Tile>
        <Tile caption="error (hint suppressed)">
          <Select
            label="Payment method"
            placeholder="Choose a method"
            options={["Card", "Twint"]}
            hint="Charged only after you confirm"
            error="Choose a payment method"
          />
        </Tile>
        <Tile caption="disabled">
          <Select label="Currency" options={["CHF"]} defaultValue="CHF" disabled />
        </Tile>
        <Tile caption="loading">
          <Select label="Airport" placeholder="Loading airports…" loading />
        </Tile>
        <Tile caption="long label">
          <Select label={LONG_LABEL} placeholder="Choose a class" options={VEHICLE_OPTIONS} />
        </Tile>
      </Section>

      <Section title="Checkbox">
        <Tile caption="default (unchecked)">
          <Checkbox label="Meet & greet" />
        </Tile>
        <Tile caption="checked">
          <Checkbox label="Meet & greet" checked onChange={noop} />
        </Tile>
        <Tile caption="indeterminate">
          <Checkbox label="Select all extras" indeterminate onChange={noop} />
        </Tile>
        <Tile caption="invalid">
          <Checkbox label="Accept the terms" invalid />
        </Tile>
        <Tile caption="disabled">
          <Checkbox label="Priority boarding" disabled />
        </Tile>
        <Tile caption="disabled + checked">
          <Checkbox label="Included in fare" checked disabled onChange={noop} />
        </Tile>
        <Tile caption="with description">
          <Checkbox label="Extra luggage" description="Up to two additional bags" />
        </Tile>
        <Tile caption="long label">
          <Checkbox label={LONG_LABEL} />
        </Tile>
      </Section>

      <Section title="Radio">
        <Tile caption="unselected">
          <Radio label="Economy" name="dev-vehicle-class" onChange={noop} />
        </Tile>
        <Tile caption="selected">
          <Radio label="Business" name="dev-vehicle-class" checked onChange={noop} />
        </Tile>
        <Tile caption="disabled">
          <Radio label="Van" name="dev-vehicle-class-disabled" disabled />
        </Tile>
        <Tile caption="disabled + selected">
          <Radio label="Van (fixed)" name="dev-vehicle-class-disabled-2" checked disabled onChange={noop} />
        </Tile>
        <Tile caption="with description">
          <Radio
            label="Business"
            description="Sedan or equivalent, up to 3 passengers"
            name="dev-vehicle-class-desc"
            onChange={noop}
          />
        </Tile>
        <Tile caption="long label">
          <Radio label={LONG_LABEL} name="dev-vehicle-class-long" onChange={noop} />
        </Tile>
      </Section>

      <Section title="Switch">
        <Tile caption="off">
          <Switch label="Send SMS reminders" checked={false} onChange={noop} />
        </Tile>
        <Tile caption="on">
          <Switch label="Send SMS reminders" checked onChange={noop} />
        </Tile>
        <Tile caption="disabled">
          <Switch label="Auto-confirm bookings" disabled />
        </Tile>
        <Tile caption="disabled + on">
          <Switch label="Auto-confirm bookings" checked disabled onChange={noop} />
        </Tile>
        <Tile caption="long label">
          <Switch label={LONG_LABEL} checked={false} onChange={noop} />
        </Tile>
      </Section>

      <Section title="Counter">
        <Tile caption="default">
          <Counter
            label="Passengers"
            value={2}
            onChange={noop}
            decrementLabel="Fewer passengers"
            incrementLabel="More passengers"
          />
        </Tile>
        <Tile caption="at minimum (decrement disabled)">
          <Counter
            label="Passengers"
            value={0}
            min={0}
            onChange={noop}
            decrementLabel="Fewer passengers"
            incrementLabel="More passengers"
          />
        </Tile>
        <Tile caption="at maximum (increment disabled)">
          <Counter
            label="Luggage"
            value={8}
            max={8}
            onChange={noop}
            decrementLabel="Fewer bags"
            incrementLabel="More bags"
          />
        </Tile>
        <Tile caption="disabled">
          <Counter
            label="Child seats"
            value={1}
            disabled
            onChange={noop}
            decrementLabel="Fewer child seats"
            incrementLabel="More child seats"
          />
        </Tile>
        <Tile caption="error">
          <Counter
            label="Passengers"
            value={9}
            max={8}
            error="Exceeds this vehicle's capacity"
            onChange={noop}
            decrementLabel="Fewer passengers"
            incrementLabel="More passengers"
          />
        </Tile>
        <Tile caption="long label">
          <Counter
            label={LONG_LABEL}
            value={1}
            onChange={noop}
            decrementLabel="Fewer"
            incrementLabel="More"
          />
        </Tile>
      </Section>

      <Section title="DatePicker">
        <Tile caption="default (empty)">
          <DatePicker
            label="Pickup date"
            placeholder="Pick a date"
            monthLabel="August 2026"
            dowLabels={DOW}
          />
        </Tile>
        <Tile caption="selected">
          <DatePicker
            label="Pickup date"
            value="14 August 2026"
            time="08:15"
            selectedDay={14}
            monthLabel="August 2026"
            dowLabels={DOW}
          />
        </Tile>
        <Tile caption="disabled">
          <DatePicker
            label="Return date"
            placeholder="Not available for one-way transfers"
            monthLabel="August 2026"
            dowLabels={DOW}
            disabled
          />
        </Tile>
        <Tile caption="error (hint suppressed)">
          <DatePicker
            label="Pickup date"
            placeholder="Pick a date"
            hint="Bookings open up to 90 days ahead"
            error="Choose a date at least 2 hours from now"
            monthLabel="August 2026"
            dowLabels={DOW}
          />
        </Tile>
        <Tile caption="loading">
          <DatePicker label="Pickup date" placeholder="Checking availability…" loading />
        </Tile>
        <Tile caption="long label">
          <DatePicker label={LONG_LABEL} placeholder="Pick a date" monthLabel="August 2026" dowLabels={DOW} />
        </Tile>
      </Section>

      <section style={{ marginBlockEnd: "40px" }}>
        <h2 dir="ltr" style={{ fontSize: "17px", marginBlockEnd: "4px" }}>
          Partially-filled field group
        </h2>
        <p dir="ltr" style={{ ...captionStyle, textAlign: "start", maxWidth: "640px" }}>
          A form where only some fields carry values is the normal case — no control
          here may reflow or resize because its neighbours are still empty.
        </p>
        <div style={{ ...rowStyle, alignItems: "flex-end" }}>
          <div style={tileStyle}>
            <Input label="Pickup address" defaultValue="Zurich Airport (ZRH)" />
          </div>
          <div style={tileStyle}>
            <Input label="Drop-off address" placeholder="Hotel, address or landmark" />
          </div>
          <div style={tileStyle}>
            <Select label="Vehicle class" placeholder="Choose a class" options={VEHICLE_OPTIONS} />
          </div>
          <div style={tileStyle}>
            <DatePicker
              label="Pickup date"
              placeholder="Pick a date"
              monthLabel="August 2026"
              dowLabels={DOW}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
