"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Avatar, CheckerMark, Icon } from "@/components/core";
import "./Reviews.css";

export type ReviewsItem = {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  rating: number;
  routeLabel: string;
  avatarPath: string | null;
  sourceUrl: string | null;
  verified: boolean;
};

export type ReviewsState = "default" | "loading" | "empty" | "error";

export type ReviewsProps = {
  reviews: ReviewsItem[];
  autoplaySeconds?: number;
  slideMs?: number;
  showPendingNotice?: boolean;
  state?: ReviewsState;
};

function reviewHref(url: string | null | undefined): string | null {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if ((parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname) {
      return raw;
    }
  } catch {
    /* fail closed */
  }
  return null;
}

function reducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readingDir(): 1 | -1 {
  if (typeof document === "undefined") return 1;
  return document.documentElement.dir === "rtl" ? -1 : 1;
}

export function Reviews({
  reviews,
  autoplaySeconds = 2.5,
  slideMs = 480,
  showPendingNotice = false,
  state = "default",
}: ReviewsProps) {
  const tReviews = useTranslations("reviews");
  const tCommon = useTranslations("common");
  const tFaq = useTranslations("faq");
  const rootRef = useRef<HTMLElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const onScreenRef = useRef(true);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [fromIndex, setFromIndex] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  const n = reviews.length;
  const isLoading = state === "loading";
  const isError = state === "error";
  const isEmpty = state === "empty" || (!isLoading && !isError && n === 0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const step = useCallback(
    (delta: 1 | -1, manual: boolean) => {
      if (n < 2) return;
      if (manual) {
        stoppedRef.current = true;
        clearTimer();
      }
      setFromIndex(indexRef.current);
      setDir(delta);
      setIndex((current) => {
        const next = (current + delta + n) % n;
        indexRef.current = next;
        return next;
      });
    },
    [n, clearTimer],
  );

  const arm = useCallback(() => {
    clearTimer();
    const dwell = autoplaySeconds > 0 ? autoplaySeconds * 1000 : 0;
    if (
      stoppedRef.current ||
      hoverRef.current ||
      focusRef.current ||
      !onScreenRef.current ||
      reducedMotion() ||
      !dwell ||
      n < 2 ||
      typeof document === "undefined" ||
      document.hidden
    ) {
      return;
    }
    timerRef.current = setTimeout(() => step(readingDir(), false), dwell);
  }, [autoplaySeconds, n, clearTimer, step]);

  useEffect(() => {
    indexRef.current = 0;
    setIndex(0);
    setFromIndex(null);
    stoppedRef.current = false;
  }, [n]);

  useEffect(() => {
    const root = rootRef.current;
    if (root) root.style.setProperty("--rv-ms", `${slideMs}ms`);
  }, [slideMs]);

  useEffect(() => {
    arm();
    return () => clearTimer();
  }, [arm, index, clearTimer]);

  useEffect(() => {
    const root = rootRef.current;
    const vis = () => {
      if (document.hidden) clearTimer();
      else arm();
    };
    document.addEventListener("visibilitychange", vis);

    let io: IntersectionObserver | null = null;
    if (root && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          onScreenRef.current = entries.some((entry) => entry.isIntersecting);
          if (!onScreenRef.current) clearTimer();
          else arm();
        },
        { threshold: 0.15 },
      );
      io.observe(root);
    }

    return () => {
      document.removeEventListener("visibilitychange", vis);
      io?.disconnect();
      clearTimer();
    };
  }, [arm, clearTimer]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(readingDir(), true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step((readingDir() === 1 ? -1 : 1) as 1 | -1, true);
    }
  }

  const liveText = n > 0 ? tReviews("reviewPosition", { n: index + 1, total: n }) : "";

  return (
    <section
      ref={rootRef}
      id="reviews"
      data-rv="1"
      data-dir={dir < 0 ? "-1" : "1"}
      data-state={state}
      aria-labelledby="reviews-title"
    >
      <div className="vt-rv-grain" aria-hidden="true" />
      <div data-rv-wrap="1">
        <div className="vt-rv-head">
          <p className="vt-rv-kicker">
            <CheckerMark size={16} />
            {tReviews("client-reviews")}
          </p>
          <h2 id="reviews-title">{tReviews("what-clients-say-about-us")}</h2>
        </div>

        {isLoading ? (
          <div data-rv-grid="1" data-state="loading" aria-busy="true">
            <div data-rv-card="1">
              <div data-rv-skel="av" />
              <div data-rv-skel="line" />
              <div data-rv-skel="line" />
            </div>
            <div data-rv-quote="1">
              <div data-rv-skel="quote" />
            </div>
          </div>
        ) : null}

        {isEmpty ? (
          <div data-rv-empty="1">
            <strong>{tReviews("no-reviews-are-published-yet")}</strong>
            <span>{tReviews("reviews-appear-here-as-soon-as-they-are-published")}</span>
          </div>
        ) : null}

        {isError ? (
          <div data-rv-empty="1" data-state="error">
            <strong>{tReviews("could-not-load-reviews")}</strong>
            <span>{tCommon("empty")}</span>
          </div>
        ) : null}

        {!isLoading && !isEmpty && !isError ? (
          <div
            data-rv-grid="1"
            role="group"
            aria-roledescription="carousel"
            aria-label={tReviews("client-reviews")}
            onMouseEnter={() => {
              hoverRef.current = true;
              clearTimer();
            }}
            onMouseLeave={() => {
              hoverRef.current = false;
              arm();
            }}
            onFocus={() => {
              focusRef.current = true;
              clearTimer();
            }}
            onBlur={() => {
              focusRef.current = false;
              arm();
            }}
            onKeyDown={onKeyDown}
          >
            <div data-rv-card="1">
              <div data-rv-stack="1">
                {reviews.map((review, i) => {
                  const on = i === index;
                  const href = reviewHref(review.sourceUrl);
                  return (
                    <div
                      key={review.id}
                      data-rv-slide="1"
                      data-rv-face="1"
                      data-i={String(i + 1)}
                      data-on={on ? "1" : "0"}
                      data-was={!on && fromIndex === i ? "1" : "0"}
                      aria-hidden={on ? undefined : true}
                    >
                      <span data-rv-av="1">
                        <Avatar name={review.authorName} size="xl" />
                      </span>
                      <strong data-rv-name="1">{review.authorName}</strong>
                      {review.routeLabel ? <span data-rv-sub="1">{review.routeLabel}</span> : null}
                      {review.rating > 0 ? (
                        <span
                          data-rv-stars="1"
                          role="img"
                          aria-label={tReviews("rating-label", { n: review.rating, max: 5 })}
                        >
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Icon
                              key={star}
                              name="star"
                              size={14}
                              color={
                                star <= review.rating ? "var(--vt-yellow)" : "var(--vt-grey-300)"
                              }
                            />
                          ))}
                        </span>
                      ) : null}
                      {review.verified ? (
                        <span data-rv-badge="1">
                          <Icon name="shield-check" size={14} color="currentColor" />
                          {tCommon("verified")}
                        </span>
                      ) : null}
                      {href ? (
                        <a
                          data-rv-link="1"
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tReviews("read-the-original")}
                          <Icon name="external-link" size={14} color="currentColor" />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div data-rv-quote="1">
              <div data-rv-stack="1">
                {reviews.map((review, i) => {
                  const on = i === index;
                  return (
                    <blockquote
                      key={review.id}
                      data-rv-slide="1"
                      data-rv-q="1"
                      data-i={String(i + 1)}
                      data-on={on ? "1" : "0"}
                      data-was={!on && fromIndex === i ? "1" : "0"}
                      role="group"
                      aria-roledescription="slide"
                      aria-label={tReviews("reviewPosition", { n: i + 1, total: n })}
                      aria-hidden={on ? undefined : true}
                    >
                      <p data-rv-text="1">“{review.body}”</p>
                    </blockquote>
                  );
                })}
              </div>
            </div>

            <div data-rv-nav="1">
              <button type="button" data-rv-arrow="1" aria-label={tReviews("previous-review")} onClick={() => step((readingDir() === 1 ? -1 : 1) as 1 | -1, true)}>
                <Icon name="chevron-left" size={20} color="currentColor" />
              </button>
              <div data-rv-dots="1" aria-hidden="true">
                {reviews.map((review, i) => (
                  <span key={review.id} data-rv-dot="1" data-i={String(i + 1)} data-on={i === index ? "1" : "0"} />
                ))}
              </div>
              <button type="button" data-rv-arrow="1" aria-label={tReviews("next-review")} onClick={() => step(readingDir(), true)}>
                <Icon name="chevron-right" size={20} color="currentColor" />
              </button>
            </div>
          </div>
        ) : null}

        <span className="vt-rv-live" aria-live="polite">
          {liveText}
        </span>

        {showPendingNotice ? (
          <div data-rv-note="1">
            <span data-rv-note-k="1">{tFaq("pending-client-input")}</span>
            <ul>
              <li>{tReviews("no-name-quote-or-count-on-this-page-is-real-each")}</li>
              <li>{tReviews("platform-names-are-set-in-type-as-stand-ins-conf")}</li>
              <li>{tReviews("autoplay-advances-every-1-5-s-as-specified-with")}</li>
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
