"use client";

import type { CSSProperties, ReactNode } from "react";
import { FaqCard, FaqGrid, type FaqItem } from "@/components/marketing";

const TIP: FaqItem = {
  id: "tip",
  questionKey: "do-i-need-to-tip-the-chauffeur",
  answerKeys: ["no-the-gratuity-is-already-in-the-price-you-were"],
};

const SEAT: FaqItem = {
  id: "child-seat",
  questionKey: "can-i-bring-my-own-child-or-booster-seat",
  answerKeys: [
    "yes-and-it-travels-free-we-can-also-provide-one",
    "swiss-law-decides-which-seat-a-child-needs-and-t",
  ],
};

const SAMPLE: FaqItem[] = [TIP, SEAT];

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
  minInlineSize: "280px",
  maxInlineSize: "420px",
};

const wideTileStyle: CSSProperties = {
  ...tileStyle,
  minInlineSize: "320px",
  maxInlineSize: "100%",
  inlineSize: "100%",
};

const captionStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--vt-text-muted)",
  textAlign: "center",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBlockEnd: "40px" }}>
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
  state,
  children,
}: {
  caption: string;
  wide?: boolean;
  state: string;
  children: ReactNode;
}) {
  return (
    <div data-state={state} style={wide ? wideTileStyle : tileStyle}>
      {children}
      <span dir="ltr" style={captionStyle}>
        {caption}
      </span>
    </div>
  );
}

export function FaqGallery() {
  return (
    <main data-faq-gallery="1">
      <Section title="FaqCard">
        <Tile caption="closed" state="closed">
          <FaqCard item={TIP} open={false} onToggle={noop} />
        </Tile>
        <Tile caption="open" state="open">
          <FaqCard item={TIP} open onToggle={noop} />
        </Tile>
        <Tile caption="focus (Tab in spec)" state="focus">
          <FaqCard item={SEAT} open={false} onToggle={noop} />
        </Tile>
        <Tile caption="press (active in spec)" state="press">
          <FaqCard item={SEAT} open={false} onToggle={noop} />
        </Tile>
        <Tile caption="loading" state="loading">
          <FaqCard item={TIP} open={false} onToggle={noop} state="loading" />
        </Tile>
      </Section>
      <Section title="FaqGrid">
        <Tile caption="multi (default)" state="multi" wide>
          <FaqGrid items={SAMPLE} />
        </Tile>
        <Tile caption="single" state="single" wide>
          <FaqGrid items={SAMPLE} mode="single" />
        </Tile>
        <Tile caption="loading" state="grid-loading" wide>
          <FaqGrid items={SAMPLE} state="loading" />
        </Tile>
        <Tile caption="empty (items=[])" state="empty" wide>
          <FaqGrid items={[]} />
        </Tile>
      </Section>
    </main>
  );
}
