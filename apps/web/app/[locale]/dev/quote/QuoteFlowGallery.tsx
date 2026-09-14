"use client";

// This is the contract rendered, not the widget. Phase 5 composes these
// same bindings into app/[locale]/page.tsx's booking widget; this file is
// deleted or reduced to a states gallery once it does.
//
// Zero new components. If a state seems to need one, it needs a
// composition — 04-UI-SPEC.md's framing is checker-verified and this file
// is where it either holds or quietly stops holding.
//
// Every amount goes through formatAmount from apps/web/lib/currency.ts.
// CHF 000 appears because the fixture's value is null (D-46), never because
// of a live-pricing branch.
//
// Local layout is inline styles hung off data-* attributes, never a class
// selector and never a restatement of a design-system component. No colour,
// font, radius or shadow value is invented; every value is a --vt-* token.
//
// No glow: no accent shadow token, no tinted halo, no blurred halo.
// The countdown's danger state is a colour and border change.
//
// No tinted yellow surfaces or brown-yellow text. Where a kit component's
// default is tinted, use inverse / info or a charcoal panel instead.
//
// Lay out with logical properties so Arabic reverses correctly.
//
// Add NO new i18n key. Plan 04-08 landed every quote.* and price.* string.

import type { CSSProperties, ReactNode } from "react";
import { createTranslator, useLocale, useMessages } from "next-intl";
import { Badge, Icon, Tag } from "@/components/core";
import type { BadgeTone } from "@/components/core";
import { Alert, Toast } from "@/components/feedback";
import type { AlertTone } from "@/components/feedback";
import { Counter, DatePicker, Input } from "@/components/forms";
import { PriceSummary, VehicleCard } from "@/components/transfer";
import type { PriceLine } from "@/components/transfer";
import { formatAmount } from "@/lib/currency";
import {
  LOCK_DANGER_THRESHOLD_S,
  REFUSAL_BINDINGS,
  type Binding,
  type QuoteErrorCode,
  type RefusalTone,
} from "@/lib/quote/client-contract";
import {
  COUPON_REFUSAL_RULES,
  couponApplied,
  couponRefusals,
  eligibleBoard,
  ineligibleReasonBoard,
  noEligibleClassBoard,
} from "@/lib/quote/client-fixtures";
import type { ClassBoardEntry } from "@/lib/pricing/types";

const CLASS_NAMES = {
  economy: "Economy",
  business: "Business",
  first: "First",
  van: "Van",
} as const;

const SYNTHETIC_FLIGHT = "XX 000";

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--vt-space-6)",
  alignItems: "flex-start",
  paddingBlock: "var(--vt-space-4)",
  borderBlockEnd: "1px solid var(--vt-border-subtle)",
};

const tileStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "var(--vt-space-2)",
  minInlineSize: "220px",
  maxInlineSize: "360px",
};

const wideTileStyle: CSSProperties = {
  ...tileStyle,
  minInlineSize: "280px",
  maxInlineSize: "420px",
};

const captionStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--vt-text-muted)",
  textAlign: "center",
};

function Section({
  title,
  section,
  children,
}: {
  title: string;
  section: string;
  children: ReactNode;
}) {
  return (
    <section data-quote-section={section} style={{ marginBlockEnd: "40px" }}>
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

function lookupMessage(messages: unknown, key: string): string {
  const parts = key.split(".");
  function walk(node: unknown, segs: string[]): unknown {
    if (!node || typeof node !== "object" || segs.length === 0) return undefined;
    const rec = node as Record<string, unknown>;
    const rest = segs.join(".");
    if (rest in rec && typeof rec[rest] === "string") return rec[rest];
    const head = segs[0];
    if (head === undefined) return undefined;
    if (head in rec) return walk(rec[head], segs.slice(1));
    return undefined;
  }
  const found = walk(messages, parts);
  return typeof found === "string" ? found : "";
}

function useLabel() {
  const locale = useLocale();
  const messages = useMessages();
  return (key: string, values?: Record<string, string | number>) => {
    const raw = lookupMessage(messages, key);
    if (!raw) return "";
    if (!values) return raw;
    const t = createTranslator({ locale, messages: { _msg: raw } });
    return t("_msg", values);
  };
}

function mmss(totalS: number): string {
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function className(slug: ClassBoardEntry["slug"]): ReactNode {
  return <span className="vt-dir-keep">{CLASS_NAMES[slug as keyof typeof CLASS_NAMES] ?? slug}</span>;
}

function ineligiblePrice(
  entry: ClassBoardEntry,
  label: (key: string, values?: Record<string, string | number>) => string,
): string {
  const reason = entry.ineligible_reason;
  if (reason === "pax") return label("quote.class.na_pax", { n: entry.effective_max_pax });
  if (reason === "bags") return label("quote.class.na_bags", { n: entry.max_bags });
  if (reason === "unavailable") return label("quote.class.unavailable");
  if (reason === "no_rate") return label("quote.class.no_rate");
  if (reason === "route_off") return label("quote.class.route_off");
  return "";
}

function linesFor(
  entry: ClassBoardEntry,
  label: (key: string, values?: Record<string, string | number>) => string,
): PriceLine[] {
  return entry.lines.map((line) => ({
    label: label(line.i18n_key, line.params as Record<string, string | number> | undefined),
    amount: line.amount_rappen,
    credit: line.kind === "discount",
    muted: line.kind === "included",
  }));
}

function alertTone(tone: RefusalTone): AlertTone {
  return tone === "danger" ? "danger" : "info";
}

function toastTone(tone: RefusalTone): "neutral" | "danger" {
  return tone === "neutral" ? "neutral" : "danger";
}

function RefusalView({
  code,
  binding,
  text,
}: {
  code: QuoteErrorCode;
  binding: Binding;
  text: string;
}) {
  switch (binding.component) {
    case "Input":
      return binding.slot === "error" ? (
        <Input label={code} error={text} readOnly />
      ) : (
        <Input label={code} hint={text} readOnly />
      );
    case "Alert":
      return <Alert tone={alertTone(binding.tone)}>{text}</Alert>;
    case "DatePicker":
      return (
        <DatePicker
          label={code}
          error={text}
          placeholder=""
          prevMonthLabel=""
          nextMonthLabel=""
        />
      );
    case "PriceSummary":
      return binding.slot === "note" ? (
        <PriceSummary
          total={eligibleBoard.classes[0]!.total_rappen}
          note={text}
        />
      ) : (
        <PriceSummary error={text} />
      );
    case "Toast":
      return <Toast tone={toastTone(binding.tone)}>{text}</Toast>;
    case "Counter":
      return (
        <Counter
          label={code}
          value={0}
          error={text}
          decrementLabel=""
          incrementLabel=""
        />
      );
    case "data-tok":
      return <span data-tok>{text}</span>;
    default: {
      const _exhaustive: never = binding.component;
      return _exhaustive;
    }
  }
}

function VehicleFromFixture({
  entry,
  label,
}: {
  entry: ClassBoardEntry;
  label: (key: string, values?: Record<string, string | number>) => string;
}) {
  const eligible = entry.eligible;
  // Assumption 6: ineligible cards repurpose the price slot exactly as the
  // mock's own labelFor() does — not a locked decision.
  const price = eligible
    ? formatAmount(entry.total_rappen)
    : ineligiblePrice(entry, label);
  return (
    <VehicleCard
      name={className(entry.slug)}
      price={price}
      priceNote={eligible ? label("quote.class.price_note") : undefined}
      passengers={entry.effective_max_pax}
      luggage={entry.max_bags}
      badge={
        entry.fixed_route ? label("quote.class.fixed_route_badge") : undefined
      }
      disabled={!eligible}
    />
  );
}

function Countdown({ remainingS }: { remainingS: number }) {
  // Assumption 1: Icon clock + .vt-dir-keep mm:ss + a danger-tone step under
  // two minutes. The threshold is LOCK_DANGER_THRESHOLD_S (arbitrary).
  const danger = remainingS <= LOCK_DANGER_THRESHOLD_S;
  return (
    <div
      data-lock-state={danger ? "danger" : "normal"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--vt-space-1)",
        color: danger ? "var(--vt-danger)" : "var(--vt-text-muted)",
        border: danger
          ? "1px solid var(--vt-danger)"
          : "1px solid var(--vt-border-subtle)",
        paddingInline: "var(--vt-space-2)",
        paddingBlock: "var(--vt-space-1)",
        fontSize: "14px",
      }}
    >
      <Icon
        name="clock"
        size={15}
        color={danger ? "var(--vt-danger)" : "var(--vt-text-muted)"}
      />
      <span className="vt-dir-keep">{mmss(remainingS)}</span>
    </div>
  );
}

export function QuoteFlowGallery() {
  const locale = useLocale();
  const label = useLabel();
  const selected = eligibleBoard.classes[0]!;
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <main data-quote-gallery dir={dir} style={{ padding: "32px", fontFamily: "var(--vt-font-body)" }}>
      <h1 dir="ltr">Quote flow contract</h1>
      <p dir="ltr" style={{ color: "var(--vt-text-secondary)", maxWidth: "640px" }}>
        Every state is reached by feeding a fixture through Phase 1&apos;s ported
        components. This is not the booking widget.
      </p>

      <Section title="§A — class board (eligible fixture)" section="a-board">
        {eligibleBoard.classes.map((entry) => (
          <Tile key={entry.slug} caption={entry.slug} wide>
            <VehicleFromFixture entry={entry} label={label} />
          </Tile>
        ))}
      </Section>

      <Section
        title="§A — ineligible_reason values (one class per reason)"
        section="a-ineligible"
      >
        {ineligibleReasonBoard.classes.map((entry) => (
          <Tile
            key={`${entry.slug}-${entry.ineligible_reason}`}
            caption={entry.ineligible_reason ?? entry.slug}
            wide
          >
            <div data-ineligible-reason={entry.ineligible_reason ?? ""}>
              <VehicleFromFixture entry={entry} label={label} />
            </div>
          </Tile>
        ))}
      </Section>

      <Section title="§A — no_eligible_class (status line, not an error)" section="a-none-fit">
        {noEligibleClassBoard.classes.map((entry) => (
          <Tile key={entry.slug} caption={entry.slug} wide>
            <VehicleFromFixture entry={entry} label={label} />
          </Tile>
        ))}
        <Tile caption="quote.none_fit — Assumption 5 placeholder (Alert, not a decision)" wide>
          <Alert tone="info" data-none-fit>
            {label("quote.none_fit")}
          </Alert>
        </Tile>
      </Section>

      <Section title="§B — sticky price panel empty / note / error" section="b-price">
        <Tile caption="empty — no well-formed request yet" wide>
          <div data-price-state="empty">
            <PriceSummary empty emptyMessage={label("quote.empty.subtitle")} />
          </div>
        </Tile>
        <Tile caption="note — pricing_not_live binds to PriceSummary.note" wide>
          <div data-price-state="note">
            <PriceSummary
              lines={linesFor(selected, label)}
              total={selected.total_rappen}
              totalLabel={label("price.line.total")}
              note={label(REFUSAL_BINDINGS.pricing_not_live.i18n_key)}
            />
          </div>
        </Tile>
        <Tile caption="error — well-formed request refused (quote_expired)" wide>
          <div data-price-state="error">
            <PriceSummary error={label(REFUSAL_BINDINGS.quote_expired.i18n_key)} />
          </div>
        </Tile>
      </Section>

      <Section title="§C — quote lock countdown" section="c-lock">
        <Tile caption="normal remaining time">
          <Countdown remainingS={LOCK_DANGER_THRESHOLD_S + 60} />
        </Tile>
        <Tile caption="at or below LOCK_DANGER_THRESHOLD_S — colour and border only">
          <Countdown remainingS={LOCK_DANGER_THRESHOLD_S - 30} />
        </Tile>
      </Section>

      <Section title="§E — coupon field" section="e-coupon">
        <Tile caption="default">
          <div data-coupon-state="default">
            <Input
              icon="ticket"
              label={label("quote.coupon.label")}
              placeholder={label("quote.coupon.placeholder")}
            />
          </div>
        </Tile>
        <Tile caption="applied">
          <div data-coupon-state="applied">
            <Tag icon="ticket">
              <span className="vt-dir-keep">{couponApplied.coupon?.code}</span>
            </Tag>
          </div>
        </Tile>
        {COUPON_REFUSAL_RULES.map((rule) => {
          const fixture = couponRefusals[rule];
          const key = fixture.coupon?.i18n_key ?? `quote.coupon.error.${rule}`;
          return (
            <Tile key={rule} caption={rule} wide>
              <div data-coupon-state={rule}>
                <Input
                  icon="ticket"
                  label={label("quote.coupon.label")}
                  defaultValue={fixture.coupon?.code}
                  error={label(key)}
                />
              </div>
            </Tile>
          );
        })}
      </Section>

      <Section title="§F — flight field" section="f-flight">
        <Tile caption="idle" wide>
          <div data-flight-state="idle">
            <Input
              icon="plane"
              label={label("quote.flight.label")}
              placeholder={label("quote.flight.placeholder")}
            />
            <span className="vt-dir-keep">{SYNTHETIC_FLIGHT}</span>
          </div>
        </Tile>
        <Tile caption="malformed" wide>
          <div data-flight-state="malformed">
            <Input
              icon="plane"
              label={label("quote.flight.label")}
              defaultValue={SYNTHETIC_FLIGHT}
              error={label(REFUSAL_BINDINGS.malformed.i18n_key)}
            />
          </div>
        </Tile>
        <Tile caption="not_found — muted inline note" wide>
          <div data-flight-state="not_found">
            <Input
              icon="plane"
              label={label("quote.flight.label")}
              hint={label(REFUSAL_BINDINGS.not_found.i18n_key)}
            />
          </div>
        </Tile>
        <Tile caption="unavailable — Alert tone=info, not accent" wide>
          <div data-flight-state="unavailable">
            <Alert tone="info">{label(REFUSAL_BINDINGS.provider_unavailable.i18n_key)}</Alert>
          </div>
        </Tile>
        <Tile caption="found — Assumption 4 tone mapping" wide>
          <div data-flight-state="found" role="group">
            <span className="vt-dir-keep">{SYNTHETIC_FLIGHT}</span>
            {(
              [
                ["on-time", "success"],
                ["delayed", "danger"],
                ["cancelled", "danger"],
                ["departed", "neutral"],
              ] as const satisfies ReadonlyArray<readonly [string, BadgeTone]>
            ).map(([status, tone]) => (
              <Badge key={status} tone={tone}>
                {status}
              </Badge>
            ))}
          </div>
        </Tile>
      </Section>

      <Section title="§G — mode, party size, when-picker" section="g-mode">
        <Tile caption="Counter — extras_max_child_seats" wide>
          <Counter
            label={label("common.passengers")}
            value={0}
            error={label(REFUSAL_BINDINGS.extras_max_child_seats.i18n_key)}
            decrementLabel=""
            incrementLabel=""
          />
        </Tile>
        <Tile caption="DatePicker — min_advance" wide>
          <DatePicker
            label={label("common.pickup")}
            error={label(REFUSAL_BINDINGS.min_advance.i18n_key, { minutes: 180 })}
            placeholder=""
            prevMonthLabel=""
            nextMonthLabel=""
          />
        </Tile>
      </Section>

      <Section title="§H — refusal matrix (every QuoteErrorCode)" section="h-refusals">
        {(Object.entries(REFUSAL_BINDINGS) as [QuoteErrorCode, Binding][]).map(
          ([code, binding]) => {
            const values =
              code === "min_advance" ? { minutes: 180 } : undefined;
            return (
              <Tile key={code} caption={code} wide>
                <div data-refusal-code={code}>
                  <RefusalView
                    code={code}
                    binding={binding}
                    text={label(binding.i18n_key, values)}
                  />
                </div>
              </Tile>
            );
          },
        )}
      </Section>
    </main>
  );
}
