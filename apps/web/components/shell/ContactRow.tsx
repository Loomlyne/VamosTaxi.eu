"use client";

import { createNavigation } from "next-intl/navigation";
import { Icon, type IconName } from "@/components/core";
import { routing } from "@/i18n/routing";

const { Link } = createNavigation(routing);

export type ContactRowProps = {
  icon: IconName;
  title: string;
  /** Second line. A number or an address passes `keep` so it stays left to right in Arabic. */
  sub?: string;
  keep?: boolean;
  /** Absolute href (wa.me, tel:, mailto:). Omit for the in-app contact form (`internalHref`). */
  href?: string;
  /** Locale-free app path, prefixed by the router (`/contact`). */
  internalHref?: string;
  newTab?: boolean;
  endIcon?: IconName | null;
  size?: "card" | "sheet";
  /** Pins a look for the states gallery only. */
  state?: "hover" | "press" | "focus";
  onFollow?: () => void;
};

/**
 * One way to reach Vamos inside the ContactButton menu. Twin of app/{home,pages}/ContactRow.dc.html.
 * Built from tokens: the kit's ListRow paints a tinted lead tile and renders a button, and this is
 * a link. States: hover grey-50, press grey-100 + 1px down with a white lead, focus --vt-ring.
 * There is no disabled state: the four channels are always there.
 */
export function ContactRow({
  icon,
  title,
  sub,
  keep = false,
  href,
  internalHref,
  newTab = false,
  endIcon = null,
  size = "card",
  state,
  onFollow,
}: ContactRowProps) {
  const body = (
    <>
      <span className="vt-crow__lead" aria-hidden="true">
        <Icon name={icon} size={20} color="currentColor" />
      </span>
      <span className="vt-crow__main">
        <span className="vt-crow__title">{title}</span>
        {sub ? <span className={keep ? "vt-crow__sub vt-dir-keep" : "vt-crow__sub"}>{sub}</span> : null}
      </span>
      {endIcon ? (
        <span className="vt-crow__end" aria-hidden="true">
          <Icon name={endIcon} size={16} color="currentColor" />
        </span>
      ) : null}
    </>
  );
  const common = {
    className: "vt-crow",
    "data-crow": "1",
    "data-size": size,
    "data-s": state,
    onClick: onFollow,
  };
  if (internalHref) {
    return (
      <Link href={internalHref} {...common}>
        {body}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      {...common}
    >
      {body}
    </a>
  );
}
