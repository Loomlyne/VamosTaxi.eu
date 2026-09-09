import "./StepIndicator.css";
import { Fragment } from "react";
import type { HTMLAttributes } from "react";
import { Icon } from "../core";

// design-system component bundle (reference-only per D-30), function StepIndicator
// (components/navigation/StepIndicator.jsx).
export interface StepIndicatorItem {
  label: string;
  /** Rule 2 addition — the compiled source has no error concept for a step at all
   * (confirmed by reading `function StepIndicator` directly: `state` is only ever
   * 'done' | 'current' | 'todo', derived purely from index vs. `current`). The
   * Component State Matrix marks StepIndicator with an Error row ("error = invalid
   * step"), so this is the minimal per-step flag needed to reach it — it does not
   * change how `done`/`current`/`todo` are derived. */
  error?: boolean;
  /** Optional URL. Renders the step as a link without changing layout or colours. */
  href?: string;
}

interface StepIndicatorOwnProps {
  steps?: (string | StepIndicatorItem)[];
  current?: number;
  /** Rule 2 addition — see StepIndicator.css's header comment. No default; when
   * omitted, completed steps carry no extra assistive-technology text (the same
   * "no default, not a better default" I18N-01 treatment 01-09-SUMMARY.md
   * established for Counter/DatePicker's own component-owned strings). */
  completedLabel?: string;
  className?: string;
}

export type StepIndicatorProps = StepIndicatorOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof StepIndicatorOwnProps>;

export function StepIndicator({
  steps = [],
  current = 0,
  completedLabel,
  className = "",
  ...rest
}: StepIndicatorProps) {
  return (
    <div className={["vt-steps", className].filter(Boolean).join(" ")} {...rest}>
      {steps.map((step, i) => {
        const label = typeof step === "string" ? step : step.label;
        const error = typeof step === "string" ? false : (step.error ?? false);
        const href = typeof step === "string" ? undefined : step.href;
        const state = error ? "error" : i < current ? "done" : i === current ? "current" : "todo";
        const key = `${i}-${label}`;
        const className = `vt-step vt-step--${state}`;
        const ariaCurrent = state === "current" ? ("step" as const) : undefined;
        const body = (
          <>
            <span className="vt-step__dot">
              {state === "done" ? (
                <Icon name="check" size={14} />
              ) : state === "error" ? (
                <Icon name="triangle-alert" size={14} />
              ) : (
                i + 1
              )}
            </span>
            <span className="vt-step__label">
              {label}
              {state === "done" && completedLabel ? (
                <span className="vt-step__sr">, {completedLabel}</span>
              ) : null}
            </span>
          </>
        );
        return (
          <Fragment key={key}>
            {href ? (
              <a className={className} href={href} aria-current={ariaCurrent}>
                {body}
              </a>
            ) : (
              <div className={className} aria-current={ariaCurrent}>
                {body}
              </div>
            )}
            {i < steps.length - 1 ? (
              <span className={"vt-step__rule" + (i < current ? " vt-step__rule--done" : "")} />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
