"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/core";

/**
 * UI-SPEC S2: every section is a white card (16px radius, hairline) headed by a 28px
 * charcoal numbered disc and a 20px title. `done` turns the disc into the yellow check
 * disc; `error` shows a danger line with `circle-alert` under the title.
 */
export function SectionCard({
  n,
  title,
  done = false,
  error,
  id,
  headerEnd,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  error?: string | null;
  id?: string;
  /** Inline-end of the header row (Section 2: "Have an account? Sign in"). */
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="vt-co__section" data-co-section={n} id={id}>
      <header className="vt-co__section-head">
        <span className="vt-co__disc" data-done={done ? "true" : "false"} aria-hidden="true">
          {done ? <Icon name="check" size={16} color="var(--vt-charcoal-900)" /> : <span className="vt-dir-keep">{n}</span>}
        </span>
        <h2 className="vt-co__section-title">{title}</h2>
        {headerEnd ? <div className="vt-co__section-aside">{headerEnd}</div> : null}
      </header>
      {error ? (
        <p className="vt-co__section-error" role="alert" data-co-section-error>
          <Icon name="circle-alert" size={16} color="var(--vt-danger)" />
          {error}
        </p>
      ) : null}
      {children}
    </section>
  );
}
