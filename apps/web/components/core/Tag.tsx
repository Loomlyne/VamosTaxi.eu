import "./Tag.css";
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

// design-system component bundle (reference-only per D-30), function Tag
// (components/core/Tag.jsx). The source renders a single polymorphic element via
// `createElement(Tag_, ...)` where `Tag_` is `'button'` or `'span'` depending on
// whether `onClick` is present; ported here as an explicit branch (matching
// Button.tsx's own href/button branch from Plan 01) rather than a dynamically typed
// tag, since TypeScript cannot type-check a `type` attribute against a JSX tag that
// might resolve to `span`. Class-name assembly and DOM structure are unchanged.
interface TagOwnProps {
  icon?: IconName;
  active?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement | HTMLSpanElement>) => void;
  onRemove?: (event: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
  className?: string;
}

export type TagProps = TagOwnProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement> & HTMLAttributes<HTMLSpanElement>,
    keyof TagOwnProps | "type"
  >;

export function Tag({ icon, active = false, onClick, onRemove, children, className = "", ...rest }: TagProps) {
  const clickable = Boolean(onClick);
  const cls = ["vt-tag", clickable ? "vt-tag--clickable" : "", active ? "vt-tag--active" : "", className]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </>
  );

  if (clickable) {
    return (
      <button type="button" className={cls} onClick={onClick} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {inner}
      </button>
    );
  }

  return (
    <span className={cls} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
      {inner}
    </span>
  );
}
