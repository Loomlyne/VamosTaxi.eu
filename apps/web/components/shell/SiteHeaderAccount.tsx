"use client";

import "./SiteHeaderAccount.css";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar, Icon } from "../core";

const { Link } = createNavigation(routing);

export type SessionSnapshot = {
  signedIn: boolean;
  displayName: string | null;
  emailConfirmed: boolean;
};

const SIGNED_OUT: SessionSnapshot = {
  signedIn: false,
  displayName: null,
  emailConfirmed: false,
};

export interface SiteHeaderAccountProps {
  variant: "inverse" | "overlay";
  compact?: boolean;
  signInLabel: string;
  /** Gallery/tests: skip the session fetch and render this snapshot immediately. */
  snapshot?: SessionSnapshot;
  /** Gallery: open the signed-in account menu on first paint. */
  defaultMenuOpen?: boolean;
}

function parseSnapshot(body: unknown): SessionSnapshot {
  if (!body || typeof body !== "object") return SIGNED_OUT;
  const o = body as Record<string, unknown>;
  return {
    signedIn: o.signedIn === true,
    displayName: typeof o.displayName === "string" && o.displayName.trim() ? o.displayName : null,
    emailConfirmed: o.emailConfirmed === true,
  };
}

export function SiteHeaderAccount({
  variant,
  compact = false,
  signInLabel,
  snapshot: snapshotProp,
  defaultMenuOpen = false,
}: SiteHeaderAccountProps) {
  const tCommon = useTranslations("common");
  const tHeader = useTranslations("header");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(snapshotProp ?? null);
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (snapshotProp) {
      setSnapshot(snapshotProp);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((body: unknown) => {
        if (!cancelled) setSnapshot(parseSnapshot(body));
      })
      .catch(() => {
        if (!cancelled) setSnapshot(SIGNED_OUT);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotProp]);

  useEffect(() => {
    if (!menuOpen) return;
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    const away = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("mousedown", away);
    return () => {
      document.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", away);
    };
  }, [menuOpen]);

  const signedOutControl = compact ? (
    <Link data-hd-menuacct="1" href="/sign-in" role="menuitem">
      <Icon name="user" size={18} color="currentColor" />
      <span>{signInLabel}</span>
    </Link>
  ) : (
    <Link data-hd-acct="pill" href="/sign-in">
      <Icon name="user" size={16} color="currentColor" />
      <span>{signInLabel}</span>
    </Link>
  );

  if (!snapshot || !snapshot.signedIn) {
    return signedOutControl;
  }

  const displayName = snapshot.displayName;
  const showVerify = !snapshot.emailConfirmed;
  const menuLabel = tHeader("account-menu");

  const menuItems = (
    <>
      {showVerify ? (
        <Link data-hd-verify="1" href="/account" role="menuitem">
          <Icon name="mail" size={16} color="var(--vt-yellow)" />
          <span>{tHeader("verify-your-email")}</span>
        </Link>
      ) : null}
      {/* Phase 8 builds /account and /bookings; the menu shape is the design contract. */}
      <Link data-hd-mi="1" href="/account" role="menuitem">
        <Icon name="user" size={18} color="var(--vt-text-muted)" />
        <span>{tCommon("your-account")}</span>
      </Link>
      <Link data-hd-mi="1" href="/bookings" role="menuitem">
        <Icon name="calendar-days" size={18} color="var(--vt-text-muted)" />
        <span>{tHeader("your-bookings")}</span>
      </Link>
      <Link data-hd-mi="1" href="/manage-booking" role="menuitem">
        <Icon name="settings" size={18} color="var(--vt-text-muted)" />
        <span>{tCommon("manage-a-booking")}</span>
      </Link>
      <div data-hd-mifoot="1">
        <form action={signOutAction}>
          <button type="submit" data-hd-mi="1" role="menuitem">
            <Icon name="log-out" size={18} color="currentColor" />
            <span>{tHeader("account-sign-out")}</span>
          </button>
        </form>
      </div>
    </>
  );

  if (compact) {
    return (
      <div data-hd-acctcompact="1" data-hd-surface={variant}>
        {menuItems}
      </div>
    );
  }

  return (
    <div data-hd-acctwrap="1" data-hd-surface={variant} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        data-hd-acct="disc"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={menuLabel}
        title={displayName ?? menuLabel}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Avatar
          name={displayName ?? undefined}
          icon={displayName ? undefined : "user"}
          size="sm"
        />
      </button>
      {menuOpen ? (
        <div data-hd-acctmenu="1" role="menu" aria-label={menuLabel}>
          <div data-hd-acctid="1">
            <Avatar
              name={displayName ?? undefined}
              icon={displayName ? undefined : "user"}
              size="sm"
              tone="inverse"
            />
            <span data-hd-acctmeta="1">
              <span data-hd-acctname="1">{displayName ?? menuLabel}</span>
            </span>
          </div>
          {menuItems}
        </div>
      ) : null}
    </div>
  );
}
