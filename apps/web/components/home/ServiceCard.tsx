"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Icon, type IconName } from "@/components/core";
import "./ServiceCard.css";

const { Link } = createNavigation(routing);

export type ServiceCardTone = "light" | "inverse";
export type ServiceCardState = "default" | "selected" | "disabled" | "loading";
export type ServiceCardPreview = "hover" | "press" | "focus";

export type ServiceCardProps = {
  href: string;
  titleId: string;
  icon: string;
  tone?: ServiceCardTone;
  accent?: boolean;
  shineColor?: string;
  shineIntensity?: number;
  proximity?: boolean;
  state?: ServiceCardState;
  /** Optional cover photo for the portrait card. */
  image?: string;
  imageFocus?: string;
  /** Gallery-only: paint hover/press/focus without a live pointer. */
  preview?: ServiceCardPreview;
  children?: ReactNode;
  className?: string;
};

function isIconName(name: string): name is IconName {
  return [
    "plane-landing",
    "navigation",
    "briefcase",
    "clock",
    "car-front",
    "map-pin",
    "snowflake",
    "users",
  ].includes(name);
}

function safeHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : undefined;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function ServiceCard({
  href,
  titleId,
  icon,
  tone = "light",
  accent = false,
  shineColor,
  shineIntensity = 1.25,
  proximity = true,
  state = "default",
  image,
  imageFocus = "center",
  preview,
  children,
  className = "",
}: ServiceCardProps) {
  const tCommon = useTranslations("common");
  const tServices = useTranslations("services");
  const headingId = useId();
  const cardRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);
  const title = tCommon(titleId);
  const glyph: IconName = isIconName(icon) ? icon : "car-front";
  const selected = state === "selected" || accent;
  const disabled = state === "disabled";
  const loading = state === "loading";
  const interactive = !disabled && !loading;
  const photo = (image || "").trim();

  const cls = [
    "vt-svc",
    tone === "inverse" ? "vt-svc--inverse" : "vt-svc--light",
    selected ? "vt-svc--accent" : "",
    disabled ? "vt-svc--disabled" : "",
    loading ? "vt-svc--loading" : "",
    preview ? `vt-svc--preview-${preview}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const shine = safeHex(shineColor);
  const style = {
    "--card-shine-i": String(shineIntensity),
    "--svc-focus": imageFocus,
    ...(shine ? { "--card-shine": shine } : {}),
  } as CSSProperties;

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !interactive || !proximity) return;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (reduce || !fine) return;

    const onMove = (e: PointerEvent) => {
      if (rafRef.current) return;
      const x = e.clientX;
      const y = e.clientY;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const node = cardRef.current;
        if (!node) return;
        const r = node.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const px = clamp01((x - r.left) / r.width) * 100;
        const py = clamp01((y - r.top) / r.height) * 100;
        node.style.setProperty("--card-px", `${px}%`);
        node.style.setProperty("--card-py", `${py}%`);
      });
    };

    const onLeave = () => {
      el.style.removeProperty("--card-px");
      el.style.removeProperty("--card-py");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [interactive, proximity]);

  const inner = (
    <>
      <span data-svc-media="1" aria-hidden="true">
        {loading ? (
          <span className="vt-svc-skel" />
        ) : photo ? (
          <img data-svc-photo="1" src={photo} alt="" />
        ) : (
          <span data-svc-glyph="1">
            <Icon name={glyph} size={44} />
          </span>
        )}
      </span>
      <span data-svc-foot="1">
        <h3 data-svc-title="1" id={headingId}>
          {loading ? <span className="vt-svc-skel vt-svc-skel--line" /> : title}
        </h3>
        <span data-svc-desc="1">{loading ? null : children}</span>
        <span data-svc-more="1">
          <span>{tServices("learn-more")}</span>
          <span data-svc-circ="1" aria-hidden="true">
            <Icon name="arrow-right" size={18} />
          </span>
        </span>
      </span>
    </>
  );

  const dataAttrs = {
    "data-svc-card": "1",
    "data-tone": tone === "inverse" ? "charcoal" : "grey",
    "data-accent": selected ? "1" : "0",
    "data-has-image": photo ? "1" : "0",
    "data-state": state,
    "data-preview": preview,
    className: cls,
    style,
  } as const;

  const setCardRef = (node: HTMLElement | null) => {
    cardRef.current = node;
  };

  if (!interactive) {
    return (
      <div
        {...dataAttrs}
        ref={setCardRef}
        aria-disabled={disabled || undefined}
        aria-busy={loading || undefined}
        aria-labelledby={headingId}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link {...dataAttrs} href={href} aria-labelledby={headingId}>
      <span ref={setCardRef} className="vt-svc-hit">
        {inner}
      </span>
    </Link>
  );
}
