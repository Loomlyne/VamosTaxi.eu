"use client";

import { IconButton } from "@/components/core";

export function ReviewOrderControls({
  canUp,
  canDown,
  upLabel,
  downLabel,
  onUp,
  onDown,
}: {
  canUp: boolean;
  canDown: boolean;
  upLabel: string;
  downLabel: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div data-review-order="" role="group" aria-label={upLabel}>
      <IconButton
        icon="chevron-up"
        label={upLabel}
        size="sm"
        variant="outline"
        disabled={!canUp}
        data-testid="reviews-move-up"
        onClick={onUp}
      />
      <IconButton
        icon="chevron-down"
        label={downLabel}
        size="sm"
        variant="outline"
        disabled={!canDown}
        data-testid="reviews-move-down"
        onClick={onDown}
      />
    </div>
  );
}
