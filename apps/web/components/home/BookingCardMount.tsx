import type { ReactNode } from "react";

/**
 * Phase 4 owns what goes into these three slots. REFUSAL_BINDINGS and
 * client-contract.ts are Phase 4's artifacts. Plan 05-22 is the only plan
 * permitted to fill them. This shell (plan 05-06) mounts the card frame and
 * leaves board / price / status empty until that hand-off.
 */
export type BookingCardMountProps = {
  /** Rendered inside the card, below the field grid: Phase 4's per-class board. */
  board?: ReactNode;
  /** Rendered in the sticky price region: Phase 4's PriceSummary + countdown. */
  price?: ReactNode;
  /** One line in the charcoal strip head's aria-live region — the mock's stripNote. */
  status?: ReactNode;
};

export function BookingCardMount({ board, price, status }: BookingCardMountProps) {
  return (
    <div data-bc-mount="1">
      <div
        data-strip-head="1"
        aria-live="polite"
        aria-atomic="true"
      >
        {status}
      </div>
      <div data-bc-board="1">{board}</div>
      <div data-bc-price="1">{price}</div>
    </div>
  );
}
