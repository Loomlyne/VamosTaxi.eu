"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { CheckerMark } from "@/components/core";
import "./WhyVamos.css";

export type WhyVamosProps = {
  showSupportText?: boolean;
  scrollDriven?: boolean;
  scrollPerStep?: number;
};

const N = 4;
const HEADER = 76;
const WIN = 0.45;

// HowItWorks uses a one-shot IntersectionObserver to reveal a timeline.
// This section is a pinned scrub: IntersectionObserver only gates the rAF
// loop so we are not sampling scroll while the block is off-screen.

function ease(t: number) {
  return t * t * (3 - 2 * t);
}

export function WhyVamos({
  showSupportText = true,
  scrollDriven = true,
  scrollPerStep = 52,
}: WhyVamosProps) {
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const rootRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const iRef = useRef(0);
  const rafRef = useRef(0);
  const visibleRef = useRef(false);

  const rows = [
    {
      i: 1,
      title: tHome("fixed-price-no-surge"),
      body: tHome("the-price-shown-when-you-book-is-the-price-charg"),
    },
    {
      i: 2,
      title: tHome("scheduled-not-on-demand"),
      body: tHome("your-driver-is-booked-for-your-exact-pickup-time"),
    },
    {
      i: 3,
      title: tHome("local-swiss-operator"),
      body: tHome("we-drive-from-dietikon-zh-zurich-and-geneva-airp"),
    },
    {
      i: 4,
      title: tHome("professional-drivers"),
      body: tHome("your-driver-is-assigned-to-your-booking-and-waits"),
    },
  ];

  const wide = () =>
    typeof matchMedia !== "undefined" && matchMedia("(min-width: 768px)").matches;
  const reduced = () =>
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const driven = useCallback(
    () => scrollDriven && wide() && !reduced(),
    [scrollDriven],
  );
  const stepPx = useCallback(() => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return Math.max(240, (scrollPerStep / 100) * vh);
  }, [scrollPerStep]);

  const syncShots = () => {
    const root = rootRef.current;
    if (!root) return;
    const media = root.querySelector("[data-why-media]");
    const shots = root.querySelectorAll("[data-why-shot]");
    const layers = root.querySelectorAll<HTMLElement>("[data-why-layer]");
    if (!wide()) {
      shots.forEach((sh, k) => {
        const layer = layers[k];
        if (layer && layer.parentNode !== sh) sh.appendChild(layer);
        if (layer) {
          layer.style.clipPath = "none";
          layer.setAttribute("data-on", "1");
        }
      });
    } else if (media) {
      layers.forEach((layer) => {
        if (layer.parentNode !== media) {
          layer.style.clipPath = "";
          media.appendChild(layer);
        }
      });
    }
  };

  const select = (index: number) => {
    const root = rootRef.current;
    if (!root || !wide()) return;
    iRef.current = index;
    const layers = root.querySelectorAll<HTMLElement>("[data-why-layer]");
    const rowEls = root.querySelectorAll<HTMLElement>("[data-why-row]");
    layers.forEach((layer, k) => {
      layer.style.clipPath = "";
      layer.setAttribute("data-on", k <= index ? "1" : "0");
    });
    rowEls.forEach((row, k) => {
      row.setAttribute("data-on", k === index ? "1" : "0");
      row.setAttribute("aria-pressed", k === index ? "true" : "false");
    });
  };

  const paint = (raw: number) => {
    const root = rootRef.current;
    if (!root || !wide()) return;
    const layers = root.querySelectorAll<HTMLElement>("[data-why-layer]");
    const rowEls = root.querySelectorAll<HTMLElement>("[data-why-row]");
    const bars = root.querySelectorAll<HTMLElement>("[data-why-prog]");
    let active = 0;
    for (let k = 1; k < layers.length; k++) {
      const layer = layers[k];
      if (!layer) continue;
      const t = ease(Math.min(1, Math.max(0, (raw - (k - WIN)) / WIN)));
      layer.style.clipPath = `inset(${((1 - t) * 100).toFixed(3)}% 0 0 0)`;
      if (t >= 0.5) active = k;
    }
    if (layers[0]) layers[0].style.clipPath = "inset(0 0 0 0)";
    const step = Math.min(N - 1, Math.floor(raw));
    rowEls.forEach((row, k) => {
      const on = k === active ? "1" : "0";
      if (row.getAttribute("data-on") !== on) {
        row.setAttribute("data-on", on);
        row.setAttribute("aria-pressed", k === active ? "true" : "false");
      }
      if (bars[k]) {
        const scale = k < step ? 1 : k === step ? Math.min(1, Math.max(0, raw - step)) : 0;
        bars[k].style.transform = `scaleX(${scale})`;
      }
    });
    iRef.current = active;
  };

  const layout = () => {
    const wrap = wrapRef.current;
    const pin = pinRef.current;
    if (!wrap) return;
    wrap.style.height = driven() && pin ? `${pin.offsetHeight + N * stepPx()}px` : "";
  };

  const measure = () => {
    rafRef.current = 0;
    const wrap = wrapRef.current;
    const pin = pinRef.current;
    if (!wrap || !pin || !driven()) return;
    const dur = Math.max(1, wrap.offsetHeight - pin.offsetHeight);
    const p = Math.min(1, Math.max(0, (HEADER - wrap.getBoundingClientRect().top) / dur));
    paint(p * N);
  };

  const pick = (index: number) => {
    const wrap = wrapRef.current;
    const pin = pinRef.current;
    if (!wrap || !pin || !driven()) {
      select(index);
      return;
    }
    const dur = wrap.offsetHeight - pin.offsetHeight;
    const top =
      wrap.getBoundingClientRect().top + window.scrollY - HEADER + (index + 0.4) * (dur / N);
    window.scrollTo({ top, behavior: "auto" });
  };

  useEffect(() => {
    const root = rootRef.current;
    const wrap = wrapRef.current;
    if (!root || !wrap) return;

    const staticMode = !scrollDriven || reduced();
    if (staticMode) {
      root.setAttribute("data-static", "1");
      root.setAttribute("data-pin", "0");
      root.setAttribute("data-scrub", "0");
      syncShots();
      const rowEls = root.querySelectorAll("[data-why-row]");
      const layers = root.querySelectorAll("[data-why-layer]");
      rowEls.forEach((row) => {
        row.setAttribute("data-on", "1");
        row.setAttribute("aria-pressed", "true");
      });
      layers.forEach((layer) => layer.setAttribute("data-on", "1"));
      wrap.style.height = "";
      return;
    }

    root.setAttribute("data-static", "0");
    root.setAttribute("data-pin", "1");
    root.setAttribute("data-scrub", "1");

    const onScroll = () => {
      if (!visibleRef.current) return;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(measure);
    };
    const onResize = () => {
      syncShots();
      layout();
      onScroll();
    };

    const io = new IntersectionObserver((entries) => {
      visibleRef.current = entries.some((entry) => entry.isIntersecting);
      if (visibleRef.current) onScroll();
    });
    io.observe(wrap);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    syncShots();
    layout();
    onScroll();
    const later = window.setTimeout(() => {
      syncShots();
      layout();
    }, 450);

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(later);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // layout/measure read scrollPerStep via stepPx; re-bind when those props change.
  }, [scrollDriven, scrollPerStep, showSupportText]);

  const curbAlt = tCommon("a-driver-in-a-dark-jacket-waits-at-the-airport-k");
  const fleetAlt = tHome("a-black-mercedes-v-class-in-vamos-taxi-livery-pa");

  return (
    <section
      ref={rootRef}
      data-why="1"
      data-pin={scrollDriven ? "1" : "0"}
      data-scrub={scrollDriven ? "1" : "0"}
      data-static={scrollDriven ? "0" : "1"}
      aria-labelledby="why-title"
    >
      <div className="vt-why-grain" aria-hidden="true" />
      <div ref={wrapRef} className="vt-why-wrap">
        <div ref={pinRef} data-why-pin="1">
          <div className="vt-why-head">
            <p className="vt-why-kicker">
              <CheckerMark size={16} />
              {tHome("why-vamos")}
            </p>
            <h2 id="why-title" className="vt-why-title">
              {tHome("booked-ahead-priced-up-front-driver-waiting")}
            </h2>
          </div>
          <div data-why-grid="1">
            <div data-why-media="1">
              <div data-why-layer="1" data-on="1" style={{ zIndex: 1 }}>
                <div className="vt-why-fare">
                  <p className="vt-why-fare-kicker">{tHome("fare-quoted-at-booking")}</p>
                  <div>
                    <strong className="vt-why-fare-amount" data-vt-no-i18n>
                      CHF 000
                    </strong>
                    <p className="vt-why-fare-copy">
                      {tHome("your-routes-fixed-price-appears-here-the-moment")}
                    </p>
                  </div>
                </div>
              </div>
              <div data-why-layer="1" data-on="0" style={{ zIndex: 2 }}>
                <Image src="/brand/photography/hero-arrivals.jpg" alt={curbAlt} fill sizes="50vw" />
              </div>
              <div data-why-layer="1" data-on="0" style={{ zIndex: 3 }}>
                <Image
                  src="/brand/photography/fleet-van-street.jpg"
                  alt={fleetAlt}
                  fill
                  sizes="50vw"
                />
              </div>
              <div data-why-layer="1" data-on="0" style={{ zIndex: 4 }}>
                <Image src="/brand/photography/hero-arrivals.jpg" alt={curbAlt} fill sizes="50vw" />
              </div>
            </div>
            <div data-why-list="1">
              {rows.map((row, index) => (
                <button
                  key={row.i}
                  type="button"
                  data-why-row="1"
                  data-i={String(row.i)}
                  data-on={index === 0 ? "1" : "0"}
                  aria-pressed={index === 0}
                  onClick={() => pick(index)}
                >
                  <span data-why-shot="1" aria-hidden="true" />
                  <span data-why-num="1" aria-hidden="true">
                    {String(row.i).padStart(2, "0")}
                  </span>
                  <span data-why-copy="1">
                    <span data-why-t="1">{row.title}</span>
                    {showSupportText ? (
                      <span data-why-body="1">
                        <span data-why-p="1">{row.body}</span>
                      </span>
                    ) : null}
                  </span>
                  <span data-why-prog="1" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
