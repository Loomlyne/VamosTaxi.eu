import type { ReactNode } from "react";
import "./Prose.css";

export function Prose({ children }: { children: ReactNode }) {
  return <div data-mh-prose="1">{children}</div>;
}

export function ProseSection({
  id,
  labelledBy,
  children,
}: {
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} data-mh-section="1">
      {children}
    </section>
  );
}
