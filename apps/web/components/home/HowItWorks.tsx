"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckerMark, Icon } from "@/components/core";
import type { IconName } from "@/components/core";
import "./HowItWorks.css";

export type HowItWorksTone = "light" | "inverse";

export type HowItWorksProps = {
  tone?: HowItWorksTone;
  revealOnScroll?: boolean;
};

// StepCounter (app/home/StepCounter.dc.html) is a passenger +/- control — not this section.
// StepIndicator is a horizontal done/current/todo tracker. The mock timeline is Icon
// medallions on a spine, so we compose Icon rather than restyle StepIndicator.

type Step = {
  time: string;
  sub: string;
  icon: IconName;
  title: string;
  copy: string;
  accent?: boolean;
};

function fitSpine(board: HTMLElement, spine: HTMLElement) {
  const meds = board.querySelectorAll<HTMLElement>("[data-hiw-med]");
  if (meds.length < 2) return;
  const first = meds[0];
  const last = meds[meds.length - 1];
  if (!first || !last) return;
  const base = board.getBoundingClientRect();
  const a = first.getBoundingClientRect();
  const b = last.getBoundingClientRect();
  const top = a.top + a.height / 2 - base.top;
  const h = b.top + b.height / 2 - base.top - top;
  if (h <= 0) return;
  spine.style.top = `${Math.round(top)}px`;
  spine.style.bottom = "auto";
  spine.style.height = `${Math.round(h)}px`;
}

export function HowItWorks({ tone = "light", revealOnScroll = true }: HowItWorksProps) {
  const tHome = useTranslations("home");
  const steps: Step[] = [
    {
      time: tHome("now"),
      sub: tHome("today"),
      icon: "map-pin",
      title: tHome("route-or-flight-number"),
      copy: tHome("type-a-flight-number-and-the-pickup-point-and-ti"),
    },
    {
      time: tHome("now"),
      sub: tHome("today"),
      icon: "credit-card",
      title: tHome("fixed-price-paid-by-card"),
      copy: tHome("every-class-is-priced-as-you-type-review-the-tri"),
    },
    {
      time: tHome("tomorrow"),
      sub: tHome("today"),
      icon: "plane-landing",
      title: tHome("your-flight-lands"),
      copy: tHome("your-pickup-is-set-from-the-arrival-not-from-a-g"),
    },
    {
      time: tHome("tomorrow"),
      sub: tHome("today"),
      icon: "car-front",
      title: tHome("your-driver-is-booked"),
      copy: tHome("name-board-in-hand-at-the-exact-pickup-time-sixt"),
      accent: true,
    },
  ];
  const rootRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const spineRef = useRef<HTMLDivElement>(null);
  const anim = revealOnScroll;

  useEffect(() => {
    const root = rootRef.current;
    const board = boardRef.current;
    const spine = spineRef.current;
    if (!root || !board || !spine) return;

    const layout = () => fitSpine(board, spine);
    layout();
    const onResize = () => {
      window.setTimeout(layout, 120);
    };
    window.addEventListener("resize", onResize);
    const fonts = document.fonts?.ready.then(layout);

    const reduce =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!revealOnScroll || reduce || typeof IntersectionObserver === "undefined") {
      root.setAttribute("data-anim", "0");
      root.setAttribute("data-seen", "1");
      return () => {
        window.removeEventListener("resize", onResize);
        void fonts;
      };
    }

    root.setAttribute("data-anim", "1");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          root.setAttribute("data-seen", "1");
          io.disconnect();
        }
      },
      { rootMargin: "-6% 0px -14% 0px" },
    );
    io.observe(root);
    const safety = window.setTimeout(() => {
      const box = root.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) {
        root.setAttribute("data-seen", "1");
      }
    }, 1400);

    return () => {
      io.disconnect();
      window.clearTimeout(safety);
      window.removeEventListener("resize", onResize);
    };
  }, [revealOnScroll, tone]);

  return (
    <section
      ref={rootRef}
      data-hiw="1"
      data-tone={tone}
      data-anim={anim ? "1" : "0"}
      data-seen={anim ? "0" : "1"}
      aria-labelledby="hiw-title"
    >
      <div className="vt-hiw-grain" aria-hidden="true" />
      <div className="vt-hiw-inner">
        <div className="vt-hiw-head">
          <p className="vt-hiw-kicker">
            <CheckerMark size={16} />
            {tHome("how-it-works")}
          </p>
          <h2 id="hiw-title" className="vt-hiw-title">
            {tHome("one-minute-of-yours-the-rest-is-ours")}
          </h2>
        </div>
        <div ref={boardRef} data-hiw-board="1">
          <div ref={spineRef} data-hiw-spine="1" aria-hidden="true" />
          {steps.map((step, i) => (
            <div
              key={step.title}
              data-hiw-row="1"
              data-i={String(i + 1)}
              data-side={i % 2 === 0 ? "l" : "r"}
            >
              <span data-hiw-med="1" data-accent={step.accent ? "1" : "0"} aria-hidden="true">
                <Icon
                  name={step.icon}
                  size={24}
                  color={step.accent ? "var(--vt-charcoal-900)" : "var(--vt-accent)"}
                />
              </span>
              <div data-hiw-card="1">
                <div className="vt-hiw-meta">
                  <span className="vt-hiw-time">{step.time}</span>
                  <span className="vt-hiw-sub">{step.sub}</span>
                </div>
                <h3 className="vt-hiw-card-title">{step.title}</h3>
                <p className="vt-hiw-copy">{step.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
